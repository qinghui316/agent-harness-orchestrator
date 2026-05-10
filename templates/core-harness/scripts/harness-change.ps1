param(
  [Parameter(Position = 0)]
  [string]$Command = "reindex"
)

if ($Command -ne "reindex") {
  throw "Generated minimal script supports only reindex. Use Agent Harness Orchestrator for full lifecycle."
}

$root = Split-Path -Parent $PSScriptRoot
$changes = Join-Path $root "harness/changes"
$index = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  active = @()
  parking = @()
  archive = @()
}

foreach ($state in @("active", "parking", "archive")) {
  $dir = Join-Path $changes $state
  if (Test-Path -LiteralPath $dir) {
    $index[$state] = @(Get-ChildItem -LiteralPath $dir -Directory | Sort-Object Name | ForEach-Object {
      [pscustomobject]@{ name = $_.Name; path = "harness/changes/$state/$($_.Name)" }
    })
  }
}

Set-Content -LiteralPath (Join-Path $changes "INDEX.json") -Encoding UTF8 -Value (($index | ConvertTo-Json -Depth 8) + "`n")
Write-Host "Rebuilt harness/changes/INDEX.json"
