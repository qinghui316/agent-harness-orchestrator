$root = Split-Path -Parent $PSScriptRoot
$required = @(
  "docs/ECL.md",
  "docs/STATUS.md",
  "harness/changes",
  "harness/evolution"
)

if (Test-Path -LiteralPath (Join-Path $root ".agent-harness/project.json")) {
  $required = @("AGENTS.md") + $required
}

foreach ($path in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $path))) {
    throw "Missing ECL component: $path"
  }
}

Write-Host "ECL lint passed."
