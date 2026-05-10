param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$markerCodes = @(
  0x9505,
  0x951B,
  0x9286,
  0x9983,
  0x8133,
  0x744C,
  0x8930,
  0x95C6,
  0x9365,
  0x9359,
  0x9366,
  0x93C8
)
$markers = $markerCodes | ForEach-Object { [char]$_ }
$extensions = @(".md", ".json", ".ps1", ".yml", ".yaml", ".txt", ".ts", ".js", ".tsx", ".jsx", ".mjs", ".cjs")
$violations = New-Object System.Collections.Generic.List[string]

Get-ChildItem -LiteralPath $root -Recurse -File -Force |
  Where-Object {
    $relative = $_.FullName.Substring($root.Length).TrimStart([char]92, [char]47)
    $relative -notmatch '^(?:\.git|node_modules|reference-projects|\.playwright-mcp)(?:\\|/)' -and
    $extensions -contains $_.Extension
  } |
  ForEach-Object {
    $content = Get-Content -LiteralPath $_.FullName -Encoding UTF8 -Raw
    foreach ($marker in $markers) {
      if ($content.IndexOf($marker) -ge 0) {
        $violations.Add($_.FullName.Substring($root.Length).TrimStart([char]92, [char]47) + " contains mojibake marker U+" + ([int][char]$marker).ToString("X4"))
        break
      }
    }
  }

if ($violations.Count -gt 0) {
  Write-Error ("Encoding lint failed:`n" + ($violations -join "`n"))
}

Write-Host "Encoding lint passed."
