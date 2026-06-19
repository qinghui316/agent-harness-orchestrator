param(
  [Parameter(Position = 0)]
  [ValidateSet("check", "mark-complete", "status")]
  [string]$Command = "status",

  [string]$Status = "noop",
  [string]$EvalMode = "dry_run",
  [string]$Notes = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$evolutionDir = Join-Path $root "harness/evolution"
$statePath = Join-Path $evolutionDir "state.json"
$pendingPath = Join-Path $evolutionDir "pending.md"
$resultsPath = Join-Path $evolutionDir "results.tsv"
$archiveDir = Join-Path $root "harness/changes/archive"

function Write-Utf8File {
  param([string]$Path, [string]$Content)
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8
}

function Get-State {
  if (-not (Test-Path -LiteralPath $statePath)) {
    return [pscustomobject]@{
      version = "1.0"
      archive_threshold = 5
      last_completed_archive_count = 0
      last_completed_at = $null
    }
  }
  return Get-Content -LiteralPath $statePath -Encoding UTF8 -Raw | ConvertFrom-Json
}

function Save-State {
  param($State)
  $json = $State | ConvertTo-Json -Depth 8
  Write-Utf8File -Path $statePath -Content (($json -join "`n") + "`n")
}

function Get-ArchiveChanges {
  if (-not (Test-Path -LiteralPath $archiveDir)) { return @() }
  return @(Get-ChildItem -LiteralPath $archiveDir -Directory -Force | Sort-Object LastWriteTimeUtc, Name)
}

function Get-CandidateArchiveChanges {
  return @(Get-ArchiveChanges | Where-Object { $_.Name -notmatch '(^|-)auto-evolve-harness-' })
}

$state = Get-State
$archives = Get-ArchiveChanges
$candidateArchives = Get-CandidateArchiveChanges
$archiveCount = @($archives).Count

switch ($Command) {
  "status" {
    Write-Host "Archive changes: $archiveCount"
    Write-Host "Threshold: $($state.archive_threshold)"
    Write-Host "Last completed archive count: $($state.last_completed_archive_count)"
    if (Test-Path -LiteralPath $pendingPath) {
      Write-Host "Pending evolution: yes"
    } else {
      Write-Host "Pending evolution: no"
    }
  }
  "check" {
    $delta = $archiveCount - [int]$state.last_completed_archive_count
    if ($delta -ge [int]$state.archive_threshold) {
      $candidateLines = $candidateArchives | Select-Object -Last $delta | ForEach-Object { "- harness/changes/archive/$($_.Name)/summary.md" }
      $lines = @(
        "# Pending Harness Evolution",
        "",
        "Generated because $delta archived changes are available since the last completed evolution check.",
        "",
        "## Candidate Archives",
        "",
        ($candidateLines -join "`n"),
        "",
        "## Required Handling",
        "",
        "Create an ECL structured change for Harness evolution. Produce proposal, independent review, validation result, results.tsv row, and run scripts/harness-evolve.ps1 mark-complete."
      )
      $content = $lines -join "`n"
      Write-Utf8File -Path $pendingPath -Content ($content + "`n")
      Write-Host "Pending evolution created: harness/evolution/pending.md"
    } else {
      Write-Host "No pending evolution. $delta archived changes since last completion; threshold is $($state.archive_threshold)."
    }
  }
  "mark-complete" {
    if (-not (Test-Path -LiteralPath $resultsPath)) {
      Write-Utf8File -Path $resultsPath -Content "timestamp`tchange_id`tstatus`teval_mode`tarchive_count`tnotes`n"
    }
    $timestamp = (Get-Date).ToUniversalTime().ToString("o")
    $changeId = "manual"
    $line = "$timestamp`t$changeId`t$Status`t$EvalMode`t$archiveCount`t$Notes"
    Add-Content -LiteralPath $resultsPath -Value $line -Encoding UTF8
    $state.last_completed_archive_count = $archiveCount
    $state.last_completed_at = $timestamp
    Save-State -State $state
    if (Test-Path -LiteralPath $pendingPath) {
      Remove-Item -LiteralPath $pendingPath
    }
    Write-Host "Harness evolution marked complete."
  }
}
