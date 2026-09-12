$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($env:GITHUB_ACTIONS -ne "true" -or $env:RUNNER_ENVIRONMENT -ne "github-hosted" `
  -or $env:GITHUB_REPOSITORY -ne "qinghui316/agent-harness-orchestrator" `
  -or $env:GITHUB_REF -ne "refs/heads/codex/aho-windows-release-update-foundation-v1" `
  -or $env:GITHUB_SHA -ne $env:BEAVER_UPDATE_ACCEPTANCE_SHA `
  -or $env:RUNNER_OS -ne "Windows" -or $env:BEAVER_UPDATE_ACCEPTANCE -ne "1") {
  throw "Windows update acceptance is restricted to a disposable GitHub-hosted Windows runner."
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$runnerRoot = (Resolve-Path -LiteralPath $env:RUNNER_TEMP).Path
$acceptanceRoot = Join-Path $runnerRoot "beaver-update-acceptance"
$oldRoot = Join-Path $acceptanceRoot "old"
$newRoot = Join-Path $acceptanceRoot "new"
$installRoot = Join-Path $acceptanceRoot "installed"
$fixtureHome = Join-Path $env:USERPROFILE ".beaver-code-update-test\data"
$fixtureProject = Join-Path $acceptanceRoot "project"
$feedReady = Join-Path $acceptanceRoot "feed-ready.txt"
$resultPath = Join-Path $acceptanceRoot "result.json"
$codePfx = Join-Path $acceptanceRoot "code-signing.pfx"
$tlsPfx = Join-Path $acceptanceRoot "localhost-tls.pfx"
$publisher = "CN=Beaver Code Update Test"
$feedPort = 8443
$feedUrl = "https://localhost:$feedPort/"
$oldVersion = "0.1.2"
$newVersion = "0.1.3"
$codeCert = $null
$tlsCert = $null
$feedProcess = $null
$certificateThumbprints = @()
$passedResult = $null

function Assert-RunnerChild([string]$Path) {
  $full = [System.IO.Path]::GetFullPath($Path)
  $prefix = $runnerRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if (-not $full.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Acceptance target is outside RUNNER_TEMP."
  }
  return $full
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code ${LASTEXITCODE}: $Command" }
}

function Invoke-HiddenProcess([string]$FilePath, [string[]]$Arguments, [int]$TimeoutSeconds, [string]$Label) {
  $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "$Label exceeded its ${TimeoutSeconds}-second limit."
  }
  if ($process.ExitCode -ne 0) { throw "$Label failed with exit code $($process.ExitCode)." }
}

function New-AcceptanceCertificates([string]$PasswordText, [string]$CodePath, [string]$TlsPath) {
  $job = Start-Job -ScriptBlock {
    param($Publisher, $PlainPassword, $CodePfxPath, $TlsPfxPath)
    $ErrorActionPreference = "Stop"
    $securePassword = ConvertTo-SecureString -String $PlainPassword -AsPlainText -Force
    $expires = [DateTime]::UtcNow.AddDays(2)
    $code = New-SelfSignedCertificate -Type CodeSigningCert -Subject $Publisher -CertStoreLocation "Cert:\CurrentUser\My" `
      -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter $expires
    $tls = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "Cert:\CurrentUser\My" `
      -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter $expires
    Export-PfxCertificate -Cert $code -FilePath $CodePfxPath -Password $securePassword | Out-Null
    Export-PfxCertificate -Cert $tls -FilePath $TlsPfxPath -Password $securePassword | Out-Null
    [pscustomobject]@{ CodeThumbprint = $code.Thumbprint; TlsThumbprint = $tls.Thumbprint }
  } -ArgumentList $publisher, $PasswordText, $CodePath, $TlsPath
  try {
    if (-not (Wait-Job -Job $job -Timeout 120)) {
      Stop-Job -Job $job -ErrorAction SilentlyContinue
      throw "Disposable certificate generation exceeded its 120-second limit."
    }
    $receipt = Receive-Job -Job $job -ErrorAction Stop
    if ($job.State -ne "Completed" -or -not $receipt.CodeThumbprint -or -not $receipt.TlsThumbprint) {
      throw "Disposable certificate generation did not return a complete receipt."
    }
    return $receipt
  } finally {
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
  }
}

function Wait-Until([scriptblock]$Condition, [int]$TimeoutSeconds, [string]$Failure) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    if (& $Condition) { return }
    [System.Threading.Thread]::Sleep(1000)
  } while ([DateTime]::UtcNow -lt $deadline)
  throw $Failure
}

function Get-AcceptanceProcesses {
  @(Get-Process -Name "BeaverCodeUpdateTest" -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Path -and [System.IO.Path]::GetFullPath($_.Path).StartsWith($installRoot, [System.StringComparison]::OrdinalIgnoreCase) }
    catch { $false }
  })
}

function Stop-AcceptanceApplication([bool]$RequireGraceful) {
  $processes = @(Get-AcceptanceProcesses)
  if ($processes.Count -eq 0) { return }
  $requested = $false
  foreach ($process in $processes) {
    try { if ($process.CloseMainWindow()) { $requested = $true } } catch { }
  }
  if ($RequireGraceful -and -not $requested) { throw "The installed acceptance app did not expose a closable main window." }
  $deadline = [DateTime]::UtcNow.AddSeconds(35)
  do {
    if (@(Get-AcceptanceProcesses).Count -eq 0) { return }
    [System.Threading.Thread]::Sleep(1000)
  } while ([DateTime]::UtcNow -lt $deadline)
  if ($RequireGraceful) { throw "The installed acceptance app did not complete graceful shutdown." }
  foreach ($process in @(Get-AcceptanceProcesses)) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
}

function Install-TestPackage([string]$Installer) {
  $arguments = @("/S", "/currentuser", "/D=$installRoot")
  Invoke-HiddenProcess $Installer $arguments 180 "NSIS installation"
}

function Verify-Fixture([string]$ElectronExecutable, [string]$RuntimeRoot) {
  $previous = $env:ELECTRON_RUN_AS_NODE
  try {
    $env:ELECTRON_RUN_AS_NODE = "1"
    Invoke-Checked $ElectronExecutable @(
      (Join-Path $repoRoot "scripts\desktop-update-acceptance-fixture.mjs"),
      "verify", $fixtureHome, $fixtureProject, $RuntimeRoot
    )
  } finally {
    if ($null -eq $previous) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
    else { $env:ELECTRON_RUN_AS_NODE = $previous }
  }
}

function Start-And-AssertHealthy([string]$Executable, [string]$ExpectedVersion, [string]$ExpectedCommit) {
  $desktopLog = Join-Path $env:USERPROFILE ".beaver-code-update-test\desktop\desktop.log"
  if (Test-Path -LiteralPath $desktopLog -PathType Leaf) { Remove-Item -LiteralPath $desktopLog -Force }
  $process = Start-Process -FilePath $Executable -WindowStyle Hidden -PassThru
  Wait-Until {
    if (-not (Test-Path -LiteralPath $desktopLog -PathType Leaf)) { return $false }
    $content = Get-Content -LiteralPath $desktopLog -Raw -Encoding UTF8
    return $content.Contains("workbench-ready version=$ExpectedVersion commit=$ExpectedCommit")
  } 120 "The installed application did not load its packaged Workbench runtime."
  return $process
}

function Get-PersistedDataDigest {
  $files = @(Get-ChildItem -LiteralPath $fixtureHome -Recurse -File | Sort-Object FullName)
  if ($files.Count -eq 0) { throw "The acceptance data root is empty." }
  $parts = foreach ($file in $files) {
    "$($file.FullName.Substring($fixtureHome.Length)):$((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash)"
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($parts -join "`n"))
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes))
}

try {
  $null = Assert-RunnerChild $acceptanceRoot
  if ((Test-Path -LiteralPath $acceptanceRoot) -or (Test-Path -LiteralPath (Split-Path -Parent $fixtureHome))) {
    throw "The disposable acceptance roots already exist."
  }
  New-Item -ItemType Directory -Path $acceptanceRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $oldRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $newRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $installRoot -Force | Out-Null

  Write-Output "acceptance-stage: certificates"
  $passwordText = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  Write-Output "::add-mask::$passwordText"
  $certificateReceipt = New-AcceptanceCertificates $passwordText $codePfx $tlsPfx
  $certificateThumbprints = @($certificateReceipt.CodeThumbprint, $certificateReceipt.TlsThumbprint)
  $codeCert = Get-Item -LiteralPath "Cert:\CurrentUser\My\$($certificateReceipt.CodeThumbprint)"
  $tlsCert = Get-Item -LiteralPath "Cert:\CurrentUser\My\$($certificateReceipt.TlsThumbprint)"
  $codeCer = Join-Path $acceptanceRoot "code-signing.cer"
  $tlsCer = Join-Path $acceptanceRoot "localhost-tls.cer"
  Export-Certificate -Cert $codeCert -FilePath $codeCer | Out-Null
  Export-Certificate -Cert $tlsCert -FilePath $tlsCer | Out-Null
  Import-Certificate -FilePath $codeCer -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
  Import-Certificate -FilePath $codeCer -CertStoreLocation "Cert:\CurrentUser\TrustedPublisher" | Out-Null
  Import-Certificate -FilePath $tlsCer -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null

  Push-Location $repoRoot
  try {
    Write-Output "acceptance-stage: build-and-seed"
    Invoke-Checked "npm.cmd" @("run", "build")
    Invoke-Checked "node.exe" @(
      "scripts/desktop-update-acceptance-fixture.mjs", "seed", $fixtureHome, $fixtureProject
    )

    $env:BEAVER_BUILD_CHANNEL = "test"
    $env:BEAVER_TEST_UPDATE_URL = $feedUrl
    $env:BEAVER_PUBLISHER_SUBJECT = $publisher
    $env:CSC_LINK = $codePfx
    $env:CSC_KEY_PASSWORD = $passwordText

    $env:BEAVER_TEST_VERSION = $oldVersion
    Write-Output "acceptance-stage: package-old"
    Invoke-Checked "npm.cmd" @("run", "package:desktop:win")
    $oldBuiltInstaller = Join-Path $repoRoot "release\desktop\test\Beaver-Code-Test-Setup-$oldVersion-win-x64.exe"
    Copy-Item -LiteralPath $oldBuiltInstaller -Destination $oldRoot -Force

    $env:BEAVER_TEST_VERSION = $newVersion
    Write-Output "acceptance-stage: package-new"
    Invoke-Checked "npm.cmd" @("run", "package:desktop:win")
    $newBuiltInstallerName = "Beaver-Code-Test-Setup-$newVersion-win-x64.exe"
    Copy-Item -LiteralPath (Join-Path $repoRoot "release\desktop\test\$newBuiltInstallerName") -Destination $newRoot -Force
    Copy-Item -LiteralPath (Join-Path $repoRoot "release\desktop\test\$newBuiltInstallerName.blockmap") -Destination $newRoot -Force
    Copy-Item -LiteralPath (Join-Path $repoRoot "release\desktop\test\latest.yml") -Destination $newRoot -Force
  } finally {
    Pop-Location
  }

  $oldInstaller = Join-Path $oldRoot "Beaver-Code-Test-Setup-$oldVersion-win-x64.exe"
  $newInstallerName = "Beaver-Code-Test-Setup-$newVersion-win-x64.exe"
  $newInstaller = Join-Path $newRoot $newInstallerName
  $newBlockmapName = "$newInstallerName.blockmap"
  foreach ($path in @($oldInstaller, $newInstaller, (Join-Path $newRoot "latest.yml"), (Join-Path $newRoot $newBlockmapName))) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required acceptance artifact is missing." }
  }

  foreach ($name in @("CSC_LINK", "CSC_KEY_PASSWORD")) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
  $env:BEAVER_UPDATE_FEED_ROOT = $newRoot
  $env:BEAVER_UPDATE_FEED_READY = $feedReady
  $env:BEAVER_UPDATE_TLS_PFX = $tlsPfx
  $env:BEAVER_UPDATE_TLS_PASSWORD = $passwordText
  $env:BEAVER_UPDATE_FEED_PORT = "$feedPort"
  $env:BEAVER_UPDATE_INSTALLER_NAME = $newInstallerName
  $env:BEAVER_UPDATE_BLOCKMAP_NAME = $newBlockmapName
  Write-Output "acceptance-stage: start-feed"
  $feedProcess = Start-Process -FilePath "node.exe" -ArgumentList @((Join-Path $repoRoot "scripts\serve-desktop-update-fixture.mjs")) `
    -WindowStyle Hidden -PassThru
  Wait-Until { Test-Path -LiteralPath $feedReady -PathType Leaf } 30 "The isolated HTTPS update feed did not start."
  foreach ($name in @("BEAVER_UPDATE_TLS_PFX", "BEAVER_UPDATE_TLS_PASSWORD")) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }

  Write-Output "acceptance-stage: install-old"
  Install-TestPackage $oldInstaller
  $installedExecutable = Join-Path $installRoot "BeaverCodeUpdateTest.exe"
  $installedRuntime = Join-Path $installRoot "resources\app.asar\dist"
  $expectedCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
  if (-not (Test-Path -LiteralPath $installedExecutable -PathType Leaf)) { throw "The old test application was not installed." }

  $desktopLog = Join-Path $env:USERPROFILE ".beaver-code-update-test\desktop\desktop.log"
  if (Test-Path -LiteralPath $desktopLog -PathType Leaf) { Remove-Item -LiteralPath $desktopLog -Force }
  Write-Output "acceptance-stage: automatic-update"
  $oldProcess = Start-Process -FilePath $installedExecutable -WindowStyle Hidden -PassThru
  Wait-Until {
    if (-not (Test-Path -LiteralPath $desktopLog -PathType Leaf)) { return $false }
    $content = Get-Content -LiteralPath $desktopLog -Raw -Encoding UTF8
    return $content.Contains("update installing") `
      -and $content.Contains("workbench-ready version=$newVersion commit=$expectedCommit")
  } 600 "The signed automatic update did not install and restart the application."

  $version = (Get-Item -LiteralPath $installedExecutable).VersionInfo.ProductVersion
  if ($version -ne "${newVersion}.0" -and $version -ne $newVersion) { throw "Installed executable version is not the update version." }
  $log = Get-Content -LiteralPath $desktopLog -Raw -Encoding UTF8
  foreach ($state in @("checking", "downloading", "preparing", "stopping", "installing")) {
    if (-not $log.Contains("update $state")) { throw "Automatic update did not record the $state state." }
  }
  if (-not $oldProcess.HasExited) {
    Wait-Until { $oldProcess.Refresh(); $oldProcess.HasExited } 60 "The old application process did not exit after authorizing the installer."
  }
  [System.Threading.Thread]::Sleep(8000)
  Stop-AcceptanceApplication $true
  Write-Output "acceptance-stage: verify-updated-data"
  Verify-Fixture $installedExecutable $installedRuntime

  Write-Output "acceptance-stage: repair-install"
  Install-TestPackage $newInstaller
  $repairProcess = Start-And-AssertHealthy $installedExecutable $newVersion $expectedCommit
  Stop-AcceptanceApplication $true
  Verify-Fixture $installedExecutable $installedRuntime

  $uninstaller = Get-ChildItem -LiteralPath $installRoot -Filter "Uninstall*.exe" -File | Select-Object -First 1
  if (-not $uninstaller) { throw "The installed uninstaller was not found." }
  $dataDigestBeforeUninstall = Get-PersistedDataDigest
  Write-Output "acceptance-stage: uninstall"
  Invoke-HiddenProcess $uninstaller.FullName @("/S", "/currentuser") 180 "NSIS uninstall"
  Wait-Until { -not (Test-Path -LiteralPath $installedExecutable -PathType Leaf) } 60 "Uninstall did not remove the application binary."
  if ((Get-PersistedDataDigest) -ne $dataDigestBeforeUninstall) { throw "Uninstall changed persisted acceptance data." }

  Write-Output "acceptance-stage: reinstall"
  Install-TestPackage $newInstaller
  $reinstallProcess = Start-And-AssertHealthy $installedExecutable $newVersion $expectedCommit
  Stop-AcceptanceApplication $true
  Verify-Fixture $installedExecutable $installedRuntime

  $passedResult = [ordered]@{
    schema = 1
    result = "passed"
    oldVersion = $oldVersion
    newVersion = $newVersion
    commit = (& git -C $repoRoot rev-parse HEAD).Trim()
    signedPublisher = $publisher
    automaticUpdate = $true
    automaticRestartObserved = $true
    persistedConversation = $true
    persistedDraft = $true
    persistedQueue = $true
    repairInstall = $true
    uninstallPreservedData = $true
    reinstallReadData = $true
  }
} catch {
  if (Test-Path -LiteralPath $acceptanceRoot -PathType Container) {
    [ordered]@{
      schema = 1
      result = "failed"
      oldVersion = $oldVersion
      newVersion = $newVersion
      commit = (& git -C $repoRoot rev-parse HEAD).Trim()
    } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $resultPath -Encoding UTF8
  }
  throw
} finally {
  try { Stop-AcceptanceApplication $false } catch { }
  if ($feedProcess -and -not $feedProcess.HasExited) { Stop-Process -Id $feedProcess.Id -Force -ErrorAction SilentlyContinue }
  foreach ($thumbprint in $certificateThumbprints) {
    foreach ($store in @("My", "Root", "TrustedPublisher")) {
      $target = "Cert:\CurrentUser\$store\$thumbprint"
      if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue }
    }
  }
  foreach ($thumbprint in $certificateThumbprints) {
    foreach ($store in @("My", "Root", "TrustedPublisher")) {
      if (Test-Path -LiteralPath "Cert:\CurrentUser\$store\$thumbprint") {
        throw "A disposable acceptance certificate was not removed."
      }
    }
  }
  foreach ($name in @(
    "BEAVER_BUILD_CHANNEL", "BEAVER_TEST_VERSION", "BEAVER_TEST_UPDATE_URL", "BEAVER_PUBLISHER_SUBJECT",
    "CSC_LINK", "CSC_KEY_PASSWORD", "BEAVER_UPDATE_FEED_ROOT", "BEAVER_UPDATE_FEED_READY",
    "BEAVER_UPDATE_TLS_PFX", "BEAVER_UPDATE_TLS_PASSWORD", "BEAVER_UPDATE_FEED_PORT",
    "BEAVER_UPDATE_INSTALLER_NAME", "BEAVER_UPDATE_BLOCKMAP_NAME"
  )) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
}

if ($passedResult) {
  $passedResult | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $resultPath -Encoding UTF8
  Write-Output "Windows update acceptance passed."
}
