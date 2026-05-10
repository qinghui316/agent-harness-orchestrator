param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$errors = New-Object System.Collections.Generic.List[string]

function Add-Err {
  param([string]$Message)
  $errors.Add($Message) | Out-Null
}

function Test-File {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath (Join-Path $root $Path) -PathType Leaf)) {
    Add-Err "Missing file: $Path"
  }
}

function Test-Dir {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath (Join-Path $root $Path) -PathType Container)) {
    Add-Err "Missing directory: $Path"
  }
}

$requiredFiles = @(
  "AGENTS.md",
  "docs/ECL.md",
  "docs/STATUS.md",
  "docs/PRODUCT.md",
  "docs/ARCHITECTURE.md",
  "docs/DEVELOPMENT.md",
  "docs/references/index.md",
  "docs/references/agents-md-practice.md",
  "docs/design-docs/ref-agent-orchestrator.md",
  "docs/design-docs/ref-oh-my-codex.md",
  "docs/design-docs/ref-ecl-harness-engineer.md",
  "harness/config/environment.json",
  "harness/evolution/state.json",
  "harness/evolution/results.tsv",
  "harness/changes/INDEX.json",
  "scripts/harness-change.ps1",
  "scripts/harness-evolve.ps1",
  "scripts/lint-ecl.ps1",
  "scripts/lint-encoding.ps1"
)

foreach ($file in $requiredFiles) { Test-File $file }

$requiredDirs = @(
  "harness/changes/active",
  "harness/changes/parking",
  "harness/changes/archive",
  "harness/templates/change",
  "harness/evolution/proposals",
  "reference-projects/agent-orchestrator",
  "reference-projects/oh-my-codex",
  "reference-projects/ecl-harness-engineer"
)

foreach ($dir in $requiredDirs) { Test-Dir $dir }

$templateFiles = @("summary.md", "spec.md", "plan.md", "tasks.md", "reviews/review.md")
foreach ($file in $templateFiles) {
  Test-File ("harness/templates/change/" + $file)
}

$activeRoot = Join-Path $root "harness/changes/active"
$activeChanges = @()
if (Test-Path -LiteralPath $activeRoot) {
  $activeChanges = @(Get-ChildItem -LiteralPath $activeRoot -Directory -Force)
}

if ($activeChanges.Count -gt 1) {
  Add-Err "Expected at most one active change; found $($activeChanges.Count)."
}

if ($activeChanges.Count -eq 1) {
  foreach ($file in $templateFiles) {
    $path = Join-Path $activeChanges[0].FullName $file
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      Add-Err "Active change missing required file: $($activeChanges[0].Name)/$file"
    }
  }
  $relativeActive = $activeChanges[0].FullName.Substring($root.Length).TrimStart([char]92, [char]47) -replace '\\', '/'
  $statusPath = Join-Path $root "docs/STATUS.md"
  if (Test-Path -LiteralPath $statusPath) {
    $statusContent = Get-Content -LiteralPath $statusPath -Encoding UTF8 -Raw
    if ($statusContent -notlike "*$relativeActive*") {
      Add-Err "docs/STATUS.md does not point to active change: $relativeActive"
    }
  }
}

$eclPath = Join-Path $root "docs/ECL.md"
if (Test-Path -LiteralPath $eclPath) {
  $ecl = Get-Content -LiteralPath $eclPath -Encoding UTF8 -Raw
  foreach ($term in @("Small Change", "Structured Change", "Plan-First", "pending evolution")) {
    if ($ecl -notlike "*$term*") {
      Add-Err "docs/ECL.md missing expected term: $term"
    }
  }
}

$gitmodulesPath = Join-Path $root ".gitmodules"
if (Test-Path -LiteralPath $gitmodulesPath) {
  $gitmodules = Get-Content -LiteralPath $gitmodulesPath -Encoding UTF8 -Raw
  foreach ($path in @("reference-projects/agent-orchestrator", "reference-projects/oh-my-codex", "reference-projects/ecl-harness-engineer")) {
    if ($gitmodules -notlike "*$path*") { Add-Err ".gitmodules missing $path" }
  }
  $ignoreCount = ([regex]::Matches($gitmodules, "ignore\s*=\s*all")).Count
  if ($ignoreCount -lt 3) { Add-Err ".gitmodules should set ignore = all for all reference submodules." }
} else {
  Add-Err "Missing file: .gitmodules"
}

$indexPath = Join-Path $root "harness/changes/INDEX.json"
if (Test-Path -LiteralPath $indexPath) {
  try {
    $index = Get-Content -LiteralPath $indexPath -Encoding UTF8 -Raw | ConvertFrom-Json
    if (@($index.active).Count -ne $activeChanges.Count) {
      Add-Err "INDEX active count does not match filesystem active count."
    }
  } catch {
    Add-Err "harness/changes/INDEX.json is not valid JSON."
  }
}

if ($errors.Count -gt 0) {
  Write-Error ("ECL lint failed:`n" + ($errors -join "`n"))
}

Write-Host "ECL lint passed."
