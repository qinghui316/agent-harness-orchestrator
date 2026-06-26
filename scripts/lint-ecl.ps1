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

function Test-ActivePlaceholderLines {
  param([System.IO.DirectoryInfo]$Change)

  $files = @(
    "summary.md",
    "spec.md",
    "plan.md",
    "tasks.md",
    "reviews/review.md"
  )

  foreach ($file in $files) {
    $path = Join-Path $Change.FullName $file
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }

    $lines = Get-Content -LiteralPath $path -Encoding UTF8
    for ($i = 0; $i -lt $lines.Count; $i++) {
      $trimmed = $lines[$i].Trim()
      $isPlaceholder = (
        $trimmed -eq "TBD" -or
        $trimmed -match '^[*-]\s+TBD$' -or
        $trimmed -match '^[*-]\s+\[\s\]\s+TBD$'
      )

      if ($isPlaceholder) {
        $relative = $path.Substring($root.Length).TrimStart([char]92, [char]47) -replace '\\', '/'
        Add-Err "Active change has unresolved placeholder-only line: ${relative}:$($i + 1)"
      }
    }
  }
}

function Get-FileText {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return "" }
  return Get-Content -LiteralPath $Path -Encoding UTF8 -Raw
}

function Get-IncompleteTaskLines {
  param([System.IO.DirectoryInfo]$Change)
  $tasksPath = Join-Path $Change.FullName "tasks.md"
  if (-not (Test-Path -LiteralPath $tasksPath -PathType Leaf)) { return @() }
  return @(Get-Content -LiteralPath $tasksPath -Encoding UTF8 | Where-Object { $_ -match '^\s*-\s+\[\s\]\s+' })
}

function Test-ContinuationRationale {
  param([System.IO.DirectoryInfo]$Change)
  $summary = Get-FileText -Path (Join-Path $Change.FullName "summary.md")
  $review = Get-FileText -Path (Join-Path $Change.FullName "reviews/review.md")
  $combined = ($summary + "`n" + $review).ToLowerInvariant()
  return ($combined -match 'parked|parking|blocked|pending acceptance|pending real ui acceptance|explicit extension|continuation rationale|scope expansion rationale|ready to close|completed')
}

function Test-ScopeExpansion {
  param([System.IO.DirectoryInfo]$Change)
  if ($Change.Name -notmatch 'phase-([0-9]+)([a-z])') { return $false }
  $baseNumber = [int]$Matches[1]
  $baseLetter = $Matches[2].ToUpperInvariant()
  $combined = (
    (Get-FileText -Path (Join-Path $Change.FullName "summary.md")) + "`n" +
    (Get-FileText -Path (Join-Path $Change.FullName "spec.md")) + "`n" +
    (Get-FileText -Path (Join-Path $Change.FullName "plan.md")) + "`n" +
    (Get-FileText -Path (Join-Path $Change.FullName "reviews/review.md"))
  )
  $matches = [regex]::Matches($combined, 'Phase\s+([0-9]+)([A-Z])', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  foreach ($match in $matches) {
    $number = [int]$match.Groups[1].Value
    $letter = $match.Groups[2].Value.ToUpperInvariant()
    if ($number -gt $baseNumber) { return $true }
    if ($number -eq $baseNumber -and ([int][char]$letter) -gt ([int][char]$baseLetter)) { return $true }
  }
  return $false
}

function Test-ScopeExpansionRationale {
  param([System.IO.DirectoryInfo]$Change)
  $summary = Get-FileText -Path (Join-Path $Change.FullName "summary.md")
  return ($summary.ToLowerInvariant() -match 'scope expansion rationale|phase .*added|subphase|follow-up')
}

function Test-CloseReadySummary {
  param([System.IO.DirectoryInfo]$Change)
  $summary = Get-FileText -Path (Join-Path $Change.FullName "summary.md")
  return ($summary -match '(?im)^## Current Status\s+\r?\n\s*(Completed|Ready to close)\.?')
}

function Test-SummaryCloseoutText {
  param(
    [System.IO.DirectoryInfo]$Change,
    [string]$Scope
  )

  $summaryPath = Join-Path $Change.FullName "summary.md"
  if (-not (Test-Path -LiteralPath $summaryPath -PathType Leaf)) { return }

  $summary = Get-Content -LiteralPath $summaryPath -Encoding UTF8 -Raw
  $relative = $summaryPath.Substring($root.Length).TrimStart([char]92, [char]47) -replace '\\', '/'

  if ($summary -match '(?im)^Before close,\s+replace this with\b') {
    Add-Err "$Scope summary retains close instruction template text: $relative"
  }
}

function Test-ReviewCloseoutText {
  param(
    [System.IO.DirectoryInfo]$Change,
    [string]$Scope
  )

  $reviewPath = Join-Path $Change.FullName "reviews/review.md"
  if (-not (Test-Path -LiteralPath $reviewPath -PathType Leaf)) { return }

  $review = Get-Content -LiteralPath $reviewPath -Encoding UTF8 -Raw
  $relative = $reviewPath.Substring($root.Length).TrimStart([char]92, [char]47) -replace '\\', '/'

  if ($review -match '(?im)^Status:\s*(pending|in progress)\.\s*$') {
    Add-Err "$Scope review has stale status closeout text: $relative"
  }
  if ($review -match '(?im)^Open implementation findings:\s*$') {
    Add-Err "$Scope review has unresolved implementation findings heading: $relative"
  }
  if ($review -match '(?im)^\s*-\s*Pending until\b') {
    Add-Err "$Scope review has unresolved pending implementation finding: $relative"
  }
  if ($review -match '(?ms)^## Verification\s*\r?\n\s*Pending\.\s*(\r?\n|$)') {
    Add-Err "$Scope review has stale verification pending closeout text: $relative"
  }
}

function Test-HandoffActiveReference {
  param(
    [string]$RelativePath,
    [System.IO.DirectoryInfo[]]$ActiveChanges
  )

  $path = Join-Path $root $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return }

  $content = Get-Content -LiteralPath $path -Encoding UTF8 -Raw
  $activePathPattern = 'harness[\\/]+changes[\\/]+active[\\/]+([A-Za-z0-9._-]+)'

  if ($ActiveChanges.Count -eq 0) {
    $matches = [regex]::Matches($content, $activePathPattern)
    if ($matches.Count -gt 0) {
      $stalePaths = @($matches | ForEach-Object { $_.Value } | Select-Object -Unique)
      Add-Err "$RelativePath points to stale active change path while no active change exists: $($stalePaths -join ', ')"
    }
    return
  }

  if ($ActiveChanges.Count -eq 1) {
    $change = $ActiveChanges[0]
    $relativeActive = $change.FullName.Substring($root.Length).TrimStart([char]92, [char]47) -replace '\\', '/'
    $hasPath = $content -like "*$relativeActive*"
    $hasName = $content -like "*$($change.Name)*"
    if (-not ($hasPath -and $hasName)) {
      Add-Err "$RelativePath does not point to active change id and path: $relativeActive"
    }
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

Test-HandoffActiveReference -RelativePath "AGENTS.md" -ActiveChanges $activeChanges
Test-HandoffActiveReference -RelativePath "docs/STATUS.md" -ActiveChanges $activeChanges

if ($activeChanges.Count -eq 1) {
  foreach ($file in $templateFiles) {
    $path = Join-Path $activeChanges[0].FullName $file
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      Add-Err "Active change missing required file: $($activeChanges[0].Name)/$file"
    }
  }
  Test-ActivePlaceholderLines $activeChanges[0]
  $relativeActive = $activeChanges[0].FullName.Substring($root.Length).TrimStart([char]92, [char]47) -replace '\\', '/'
  $statusPath = Join-Path $root "docs/STATUS.md"
  if (Test-Path -LiteralPath $statusPath) {
    $statusContent = Get-Content -LiteralPath $statusPath -Encoding UTF8 -Raw
    if ($statusContent -notlike "*$relativeActive*" -or $statusContent -notlike "*$($activeChanges[0].Name)*") {
      Add-Err "docs/STATUS.md does not point to active change id and path: $relativeActive"
    }
  }
  $incompleteTasks = @(Get-IncompleteTaskLines -Change $activeChanges[0])
  if ($incompleteTasks.Count -gt 0 -and -not (Test-ContinuationRationale -Change $activeChanges[0])) {
    Add-Err "Active change has incomplete tasks without continuation, parking, blocking, pending acceptance, or close-ready rationale: $($activeChanges[0].Name)"
  }
  if ((Test-ScopeExpansion -Change $activeChanges[0]) -and -not (Test-ScopeExpansionRationale -Change $activeChanges[0])) {
    Add-Err "Active phase-scoped change includes later phases without scope expansion rationale: $($activeChanges[0].Name)"
  }
  if (Test-CloseReadySummary -Change $activeChanges[0]) {
    Test-SummaryCloseoutText -Change $activeChanges[0] -Scope "Close-ready active change"
    Test-ReviewCloseoutText -Change $activeChanges[0] -Scope "Close-ready active change"
  }
}

$archiveRoot = Join-Path $root "harness/changes/archive"
if (Test-Path -LiteralPath $archiveRoot) {
  foreach ($archivedChange in @(Get-ChildItem -LiteralPath $archiveRoot -Directory -Force)) {
    Test-ReviewCloseoutText -Change $archivedChange -Scope "Archived change"
  }
}

$eclPath = Join-Path $root "docs/ECL.md"
if (Test-Path -LiteralPath $eclPath) {
  $ecl = Get-Content -LiteralPath $eclPath -Encoding UTF8 -Raw
  foreach ($term in @("Small Change", "Structured Change", "Plan-First", "pending evolution", "preflight", "Module Boundary Coverage", "module handoff map", "forbidden write-back locations", "Future Feature Module Boundary Rule", "owner module", "compatibility facade", "forbidden write-back")) {
    if ($ecl -notlike "*$term*") {
      Add-Err "docs/ECL.md missing expected term: $term"
    }
  }
}

$reviewTemplatePath = Join-Path $root "harness/templates/change/reviews/review.md"
if (Test-Path -LiteralPath $reviewTemplatePath) {
  $reviewTemplate = Get-Content -LiteralPath $reviewTemplatePath -Encoding UTF8 -Raw
  foreach ($term in @("Source Apply Safety Coverage", "source-root mutation gate", "out-of-scope source mutation")) {
    if ($reviewTemplate -notlike "*$term*") {
      Add-Err "review template missing expected source apply safety term: $term"
    }
  }
}

$gitmodulesPath = Join-Path $root ".gitmodules"
if (Test-Path -LiteralPath $gitmodulesPath) {
  Add-Err ".gitmodules should not be tracked. Reference projects are local-only optional clones."
}

$trackedReferenceProjects = @(
  git -C $root ls-files --stage reference-projects 2>$null |
    Where-Object { $_ -match '\s160000\s' -or $_ -match '\sreference-projects/' }
)
if (@($trackedReferenceProjects).Count -gt 0) {
  Add-Err "reference-projects contains tracked entries. Reference projects must remain local-only optional clones."
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
