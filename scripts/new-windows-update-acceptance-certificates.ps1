$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($env:GITHUB_ACTIONS -ne "true" -or $env:RUNNER_ENVIRONMENT -ne "github-hosted" `
  -or $env:GITHUB_REPOSITORY -ne "qinghui316/agent-harness-orchestrator" `
  -or $env:GITHUB_REF -ne "refs/heads/codex/aho-windows-release-update-foundation-v1" `
  -or $env:GITHUB_SHA -ne $env:BEAVER_UPDATE_ACCEPTANCE_SHA `
  -or $env:RUNNER_OS -ne "Windows" -or $env:BEAVER_UPDATE_ACCEPTANCE -ne "1") {
  throw "Certificate creation is restricted to the disposable Windows acceptance runner."
}

$root = [System.IO.Path]::GetFullPath($env:BEAVER_ACCEPTANCE_CERT_ROOT)
$runnerRoot = [System.IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd([System.IO.Path]::DirectorySeparatorChar) `
  + [System.IO.Path]::DirectorySeparatorChar
if (-not $root.StartsWith($runnerRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Certificate output is outside RUNNER_TEMP."
}

$password = ConvertTo-SecureString -String $env:BEAVER_ACCEPTANCE_CERT_PASSWORD -AsPlainText -Force
$publisher = $env:BEAVER_ACCEPTANCE_CODE_SUBJECT
$tlsSubject = $env:BEAVER_ACCEPTANCE_TLS_SUBJECT
$expires = [DateTime]::UtcNow.AddDays(2)
$code = New-SelfSignedCertificate -Type CodeSigningCert -Subject $publisher -CertStoreLocation "Cert:\CurrentUser\My" `
  -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter $expires
$tls = New-SelfSignedCertificate -Subject $tlsSubject -DnsName "localhost" -CertStoreLocation "Cert:\CurrentUser\My" `
  -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter $expires
Export-PfxCertificate -Cert $code -FilePath (Join-Path $root "code-signing.pfx") -Password $password | Out-Null
Export-PfxCertificate -Cert $tls -FilePath (Join-Path $root "localhost-tls.pfx") -Password $password | Out-Null
[ordered]@{
  CodeThumbprint = $code.Thumbprint
  TlsThumbprint = $tls.Thumbprint
  CodeSubject = $publisher
  TlsSubject = $tlsSubject
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root "certificates.json") -Encoding UTF8
