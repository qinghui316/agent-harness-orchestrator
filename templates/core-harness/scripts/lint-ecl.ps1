$root = Split-Path -Parent $PSScriptRoot
$required = @(
  "AGENTS.md",
  "docs/ECL.md",
  "docs/STATUS.md",
  "harness/changes",
  "harness/evolution"
)

foreach ($path in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $path))) {
    throw "Missing ECL component: $path"
  }
}

Write-Host "ECL lint passed."
