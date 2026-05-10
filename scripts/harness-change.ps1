param(
  [Parameter(Position = 0)]
  [ValidateSet("new", "park", "resume", "close", "reindex")]
  [string]$Command = "reindex",

  [Parameter(Position = 1)]
  [string]$Name
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$changesDir = Join-Path $root "harness/changes"
$activeDir = Join-Path $changesDir "active"
$parkingDir = Join-Path $changesDir "parking"
$archiveDir = Join-Path $changesDir "archive"
$templateDir = Join-Path $root "harness/templates/change"
$indexPath = Join-Path $changesDir "INDEX.json"

function Write-Utf8File {
  param([string]$Path, [string]$Content)
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8
}

function ConvertTo-Slug {
  param([string]$Value)
  $slug = $Value.Trim().ToLowerInvariant() -replace '[^a-z0-9]+', '-'
  $slug = $slug.Trim('-')
  if ([string]::IsNullOrWhiteSpace($slug)) { throw "Change name must contain at least one ASCII letter or number." }
  return $slug
}

function Get-ChangeDirs {
  param([string]$Dir)
  if (-not (Test-Path -LiteralPath $Dir)) { return @() }
  return @(Get-ChildItem -LiteralPath $Dir -Directory -Force | Sort-Object Name)
}

function Get-ActiveChanges {
  return Get-ChangeDirs -Dir $activeDir
}

function Copy-Template {
  param([string]$Target, [string]$Title)
  $files = @(
    "summary.md",
    "spec.md",
    "plan.md",
    "tasks.md",
    "reviews/review.md"
  )
  foreach ($file in $files) {
    $source = Join-Path $templateDir $file
    $dest = Join-Path $Target $file
    $content = Get-Content -LiteralPath $source -Encoding UTF8 -Raw
    $content = $content.Replace("{title}", $Title)
    Write-Utf8File -Path $dest -Content $content
  }
}

function Get-IndexItems {
  param([string]$State, [string]$Dir)
  $items = @()
  foreach ($change in (Get-ChangeDirs -Dir $Dir)) {
    $relative = $change.FullName.Substring($root.Length).TrimStart([char]92, [char]47) -replace '\\', '/'
    $items += [pscustomobject]@{
      name = $change.Name
      path = $relative
    }
  }
  return $items
}

function Reindex {
  $index = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    active = @(Get-IndexItems -State "active" -Dir $activeDir)
    parking = @(Get-IndexItems -State "parking" -Dir $parkingDir)
    archive = @(Get-IndexItems -State "archive" -Dir $archiveDir)
  }
  $json = $index | ConvertTo-Json -Depth 8
  Write-Utf8File -Path $indexPath -Content (($json -join "`n") + "`n")
  Write-Host "Rebuilt harness/changes/INDEX.json"
}

foreach ($dir in @($activeDir, $parkingDir, $archiveDir)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

switch ($Command) {
  "new" {
    if ([string]::IsNullOrWhiteSpace($Name)) { throw "Usage: harness-change.ps1 new <name>" }
    $active = Get-ActiveChanges
    if (@($active).Count -gt 0) { throw "Cannot create a new change while an active change exists: $($active[0].Name)" }
    $slug = ConvertTo-Slug -Value $Name
    $target = Join-Path $activeDir $slug
    if (Test-Path -LiteralPath $target) { throw "Change already exists: $target" }
    New-Item -ItemType Directory -Force -Path (Join-Path $target "reviews") | Out-Null
    Copy-Template -Target $target -Title $Name
    Reindex
  }
  "park" {
    $active = Get-ActiveChanges
    if (@($active).Count -ne 1) { throw "Expected exactly one active change to park; found $(@($active).Count)." }
    $target = Join-Path $parkingDir $active[0].Name
    if (Test-Path -LiteralPath $target) { $target = Join-Path $parkingDir ($active[0].Name + "-" + (Get-Date -Format "yyyyMMddHHmmss")) }
    Move-Item -LiteralPath $active[0].FullName -Destination $target
    Reindex
  }
  "resume" {
    if ([string]::IsNullOrWhiteSpace($Name)) { throw "Usage: harness-change.ps1 resume <name>" }
    $active = Get-ActiveChanges
    if (@($active).Count -gt 0) { throw "Cannot resume while an active change exists: $($active[0].Name)" }
    $slug = ConvertTo-Slug -Value $Name
    $source = Join-Path $parkingDir $slug
    if (-not (Test-Path -LiteralPath $source)) { throw "Parked change not found: $slug" }
    Move-Item -LiteralPath $source -Destination (Join-Path $activeDir $slug)
    Reindex
  }
  "close" {
    $active = Get-ActiveChanges
    if (@($active).Count -ne 1) { throw "Expected exactly one active change to close; found $(@($active).Count)." }
    $archiveName = (Get-Date -Format "yyyyMMdd") + "-" + $active[0].Name
    $target = Join-Path $archiveDir $archiveName
    if (Test-Path -LiteralPath $target) { $target = Join-Path $archiveDir ($archiveName + "-" + (Get-Date -Format "HHmmss")) }
    Move-Item -LiteralPath $active[0].FullName -Destination $target
    Reindex
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "harness-evolve.ps1") check
  }
  "reindex" {
    Reindex
  }
}
