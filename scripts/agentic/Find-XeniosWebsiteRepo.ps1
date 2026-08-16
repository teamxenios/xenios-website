param(
  [string[]]$Roots = @(
    'C:\xenios-wt',
    'C:\Users\sboad\Downloads',
    'C:\Users\sboad\Documents',
    'C:\Users\sboad\Desktop'
  )
)

$ErrorActionPreference = 'SilentlyContinue'
$results = @()

foreach ($root in $Roots) {
  if (-not (Test-Path -LiteralPath $root)) { continue }

  Get-ChildItem -LiteralPath $root -Filter 'MASTER_CORPUS.md' -File -Recurse |
    Where-Object {
      $_.FullName -match '\\\.xenios\\MASTER_CORPUS\.md$' -and
      $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\build\\|\\coverage\\|\\\.git\\objects\\'
    } |
    ForEach-Object {
      $repo = Split-Path (Split-Path $_.FullName -Parent) -Parent
      $origin = (& git -C $repo remote get-url origin 2>$null)
      $top = (& git -C $repo rev-parse --show-toplevel 2>$null)
      if ($origin -match 'teamxenios/xenios-website') {
        $results += [pscustomobject]@{
          Repository = $repo
          GitRoot = $top
          Origin = $origin
          Corpus = $_.FullName
          AgentCli = Test-Path -LiteralPath (Join-Path $repo 'scripts\agentic\xenios-os.mjs')
        }
      }
    }
}

if ($results.Count -eq 0) {
  Write-Error 'No teamxenios/xenios-website repository with .xenios/MASTER_CORPUS.md was found.'
  exit 1
}

$results | Sort-Object Repository -Unique | Format-Table -AutoSize
