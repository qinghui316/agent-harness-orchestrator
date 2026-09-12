$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($env:GITHUB_ACTIONS -ne "true" -or $env:RUNNER_OS -ne "Windows" -or $env:BEAVER_UPDATE_ACCEPTANCE -ne "1") {
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
  $process = Start-Process -FilePath $Installer -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "NSIS installation failed with exit code $($process.ExitCode)." }
}

function Verify-Fixture([string]$ElectronExecutable) {
  $previous = $env:ELECTRON_RUN_AS_NODE
  try {
    $env:ELECTRON_RUN_AS_NODE = "1"
    Invoke-Checked $ElectronExecutable @(
      (Join-Path $repoRoot "scripts\desktop-update-acceptance-fixture.mjs"),
      "verify", $fixtureHome, $fixtureProject
    )
  } finally {
    if ($null -eq $previous) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
    else { $env:ELECTRON_RUN_AS_NODE = $previous }
  }
}

try {
  $null = Assert-RunnerChild $acceptanceRoot
  New-Item -ItemType Directory -Path $acceptanceRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $oldRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $newRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $installRoot -Force | Out-Null

  $passwordText = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  Write-Output "::add-mask::$passwordText"
  $password = ConvertTo-SecureString -String $passwordText -AsPlainText -Force
  $notAfter = [DateTime]::UtcNow.AddDays(2)
  $codeCert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $publisher -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter $notAfter
  $tlsCert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter $notAfter
  Export-PfxCertificate -Cert $codeCert -FilePath $codePfx -Password $password | Out-Null
  Export-PfxCertificate -Cert $tlsCert -FilePath $tlsPfx -Password $password | Out-Null
  $codeCer = Join-Path $acceptanceRoot "code-signing.cer"
  $tlsCer = Join-Path $acceptanceRoot "localhost-tls.cer"
  Export-Certificate -Cert $codeCert -FilePath $codeCer | Out-Null
  Export-Certificate -Cert $tlsCert -FilePath $tlsCer | Out-Null
  Import-Certificate -FilePath $codeCer -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
  Import-Certificate -FilePath $codeCer -CertStoreLocation "Cert:\CurrentUser\TrustedPublisher" | Out-Null
  Import-Certificate -FilePath $tlsCer -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null

  Push-Location $repoRoot
  try {
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
    Invoke-Checked "npm.cmd" @("run", "package:desktop:win")
    $oldBuiltInstaller = Join-Path $repoRoot "release\desktop\test\Beaver-Code-Test-Setup-$oldVersion-win-x64.exe"
    Copy-Item -LiteralPath $oldBuiltInstaller -Destination $oldRoot -Force

    $env:BEAVER_TEST_VERSION = $newVersion
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
  $feedProcess = Start-Process -FilePath "node.exe" -ArgumentList @((Join-Path $repoRoot "scripts\serve-desktop-update-fixture.mjs")) `
    -WindowStyle Hidden -PassThru
  Wait-Until { Test-Path -LiteralPath $feedReady -PathType Leaf } 30 "The isolated HTTPS update feed did not start."
  foreach ($name in @("BEAVER_UPDATE_TLS_PFX", "BEAVER_UPDATE_TLS_PASSWORD")) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }

  Install-TestPackage $oldInstaller
  $installedExecutable = Join-Path $installRoot "BeaverCodeUpdateTest.exe"
  if (-not (Test-Path -LiteralPath $installedExecutable -PathType Leaf)) { throw "The old test application was not installed." }

  $desktopLog = Join-Path $env:USERPROFILE ".beaver-code-update-test\desktop\desktop.log"
  $oldProcess = Start-Process -FilePath $installedExecutable -WindowStyle Hidden -PassThru
  Wait-Until {
    if (-not (Test-Path -LiteralPath $desktopLog -PathType Leaf)) { return $false }
    $content = Get-Content -LiteralPath $desktopLog -Raw -Encoding UTF8
    return $content.Contains("version=$newVersion") -and $content.Contains("update installing")
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
  Verify-Fixture $installedExecutable

  Install-TestPackage $newInstaller
  Verify-Fixture $installedExecutable

  $uninstaller = Get-ChildItem -LiteralPath $installRoot -Filter "Uninstall*.exe" -File | Select-Object -First 1
  if (-not $uninstaller) { throw "The installed uninstaller was not found." }
  $uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList @("/S", "/currentuser") -WindowStyle Hidden -Wait -PassThru
  if ($uninstall.ExitCode -ne 0) { throw "Uninstall failed with exit code $($uninstall.ExitCode)." }
  Wait-Until { -not (Test-Path -LiteralPath $installedExecutable -PathType Leaf) } 60 "Uninstall did not remove the application binary."
  $packagedElectron = Join-Path $repoRoot "release\desktop\test\win-unpacked\BeaverCodeUpdateTest.exe"
  Verify-Fixture $packagedElectron

  Install-TestPackage $newInstaller
  Verify-Fixture $installedExecutable
  Stop-AcceptanceApplication $false

  $result = [ordered]@{
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
  $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $resultPath -Encoding UTF8
  Write-Output "Windows update acceptance passed."
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
  foreach ($certificate in @($codeCert, $tlsCert)) {
    if (-not $certificate) { continue }
    foreach ($store in @("My", "Root", "TrustedPublisher")) {
      $target = "Cert:\CurrentUser\$store\$($certificate.Thumbprint)"
      if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue }
    }
  }
  foreach ($name in @(
    "BEAVER_BUILD_CHANNEL", "BEAVER_TEST_VERSION", "BEAVER_TEST_UPDATE_URL", "BEAVER_PUBLISHER_SUBJECT",
    "CSC_LINK", "CSC_KEY_PASSWORD", "BEAVER_UPDATE_FEED_ROOT", "BEAVER_UPDATE_FEED_READY",
    "BEAVER_UPDATE_TLS_PFX", "BEAVER_UPDATE_TLS_PASSWORD", "BEAVER_UPDATE_FEED_PORT",
    "BEAVER_UPDATE_INSTALLER_NAME", "BEAVER_UPDATE_BLOCKMAP_NAME"
  )) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
}
