[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'XeniosControl.Common.ps1')

function Test-PackageExcludedPath {
  param([Parameter(Mandatory = $true)][string]$RelativePath)
  $normalized = $RelativePath.Replace('\', '/').TrimStart('/')
  $segments = @($normalized -split '/')
  $blockedDirectories = @('.git', '.xenios', '.agents', '.claude', 'attached_assets', 'node_modules', '.next', 'dist', 'build', 'coverage', '.cache', 'cache', 'logs', 'log', 'tmp', 'temp')
  foreach ($segment in $segments) {
    if ($blockedDirectories -contains $segment.ToLowerInvariant()) { return $true }
  }
  $name = $segments[-1]
  if ($name -match '^\.env($|\.)') { return $true }
  if ($name -match '^\.(npmrc|netrc|pypirc|dockercfg)$') { return $true }
  if ($name -match '^(credentials?|secrets?|service[-_.]?account)(\..*)?$') { return $true }
  if ($name -match '^id_(rsa|dsa|ecdsa|ed25519)(\..*)?$') { return $true }
  if ($name -match '\.(key|pem|p12|pfx|jks|keystore|log)$') { return $true }
  return $false
}

$repoRoot = Get-XeniosRepoRoot
$branch = Get-XeniosGitValue -RepoRoot $repoRoot -Arguments @('branch', '--show-current')
$sha = Get-XeniosGitValue -RepoRoot $repoRoot -Arguments @('rev-parse', 'HEAD')
$shortSha = Get-XeniosGitValue -RepoRoot $repoRoot -Arguments @('rev-parse', '--short=12', 'HEAD')
$tree = Get-XeniosGitValue -RepoRoot $repoRoot -Arguments @('rev-parse', 'HEAD^{tree}')
$remote = Get-XeniosGitValue -RepoRoot $repoRoot -Arguments @('remote', 'get-url', 'origin')
if ($sha -eq 'unavailable' -or $shortSha -eq 'unavailable') { throw 'Cannot create an exact-source package without a Git HEAD.' }

$downloads = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
$destination = Join-Path $downloads 'XENIOS-LAUNCH'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$destination = [System.IO.Path]::GetFullPath($destination)

$tempParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$tempRoot = Join-Path $tempParent ("xenios-package-" + [Guid]::NewGuid().ToString('N'))
$tempRoot = Assert-XeniosChildPath -Parent $tempParent -Child $tempRoot
$rawArchive = Join-Path $tempRoot 'head.zip'
$stage = Join-Path $tempRoot 'stage'
New-Item -ItemType Directory -Path $tempRoot | Out-Null
New-Item -ItemType Directory -Path $stage | Out-Null

$zipPath = Join-Path $destination "xenios-website-$shortSha.zip"
$handoffPath = Join-Path $destination 'XENIOS-LAUNCH-HANDOFF.md'

try {
  Write-Host "Creating committed exact-SHA snapshot: $sha"
  & git -C $repoRoot archive --format=zip --output=$rawArchive $sha
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $rawArchive -PathType Leaf)) {
    throw 'git archive failed; no package was published.'
  }
  Expand-Archive -LiteralPath $rawArchive -DestinationPath $stage -Force

  $stageFull = [System.IO.Path]::GetFullPath($stage)
  $directories = @(Get-ChildItem -LiteralPath $stage -Directory -Recurse -Force | Sort-Object { $_.FullName.Length } -Descending)
  foreach ($directory in $directories) {
    $relative = $directory.FullName.Substring($stageFull.Length).TrimStart('\')
    if (Test-PackageExcludedPath -RelativePath $relative) {
      $verified = Assert-XeniosChildPath -Parent $stageFull -Child $directory.FullName
      Remove-Item -LiteralPath $verified -Recurse -Force
    }
  }
  $files = @(Get-ChildItem -LiteralPath $stage -File -Recurse -Force)
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($stageFull.Length).TrimStart('\')
    if (Test-PackageExcludedPath -RelativePath $relative) {
      $verified = Assert-XeniosChildPath -Parent $stageFull -Child $file.FullName
      Remove-Item -LiteralPath $verified -Force
    }
  }

  $forbidden = @()
  foreach ($file in @(Get-ChildItem -LiteralPath $stage -File -Recurse -Force)) {
    $relative = $file.FullName.Substring($stageFull.Length).TrimStart('\')
    if (Test-PackageExcludedPath -RelativePath $relative) { $forbidden += $relative; continue }
    if ($file.Length -le 2MB -and $file.Extension -match '^\.(cjs|css|html|js|json|jsx|md|mjs|ps1|sh|sql|toml|ts|tsx|txt|yaml|yml)$') {
      $markerRules = [ordered]@{
        'private-key marker' = '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
        'AWS access-key marker' = '\bAKIA[0-9A-Z]{16}\b'
        'GitHub live-token marker' = '\bgh[pousr]_[A-Za-z0-9]{20,}\b'
        'Stripe live-secret marker' = '\bsk_live_[A-Za-z0-9_-]{24,}\b'
        'Slack live-token marker' = '\bxox[baprs]-[A-Za-z0-9-]{24,}\b'
        'Supabase service-role JWT assignment' = '(?i)SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'']?eyJ[A-Za-z0-9_-]{60,}'
      }
      foreach ($rule in $markerRules.GetEnumerator()) {
        if (Select-String -LiteralPath $file.FullName -Pattern $rule.Value -Quiet) {
          $forbidden += "$relative [$($rule.Key)]"
          break
        }
      }
    }
  }
  if ($forbidden.Count -gt 0) {
    Write-Host 'Package scan rejected these paths/rules (contents and values are not printed):'
    $forbidden | ForEach-Object { Write-Host " - $_" }
    throw 'Sanitized package scan failed. No zip was published.'
  }

  if (Test-Path -LiteralPath $zipPath -PathType Leaf) { Remove-Item -LiteralPath $zipPath -Force }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory($stageFull, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

  $catalogPath = Join-Path $repoRoot 'docs\production-completion\catalog\catalog-reconciliation.json'
  $checkoutStatus = 'UNKNOWN'
  $catalogSummary = 'Catalog reconciliation unavailable.'
  if (Test-Path -LiteralPath $catalogPath -PathType Leaf) {
    try {
      $catalog = Get-Content -LiteralPath $catalogPath -Raw | ConvertFrom-Json
      $directBuy = [int]$catalog.counts.direct_buy
      $checkoutStatus = if ($directBuy -eq 0) { 'DARK' } else { 'REVIEW REQUIRED' }
      $catalogSummary = "direct-buy $directBuy; assisted-order $([int]$catalog.counts.assisted_order); Care-required $([int]$catalog.counts.care_required); unavailable $([int]$catalog.counts.unavailable)."
    } catch { }
  }
  $dirty = Get-XeniosGitValue -RepoRoot $repoRoot -Arguments @('status', '--porcelain=v1', '--untracked-files=normal')
  $workingTreeNote = if ([string]::IsNullOrWhiteSpace($dirty) -or $dirty -eq 'unavailable') {
    'The packaging worktree was clean.'
  } else {
    'The packaging worktree had local changes. This archive intentionally contains committed HEAD only; uncommitted files are not represented.'
  }
  $generatedAt = [DateTime]::UtcNow.ToString('o')
  $handoff = @"
# Xenios Launch Handoff

Generated: $generatedAt
Repository: $remote
Branch at packaging: $branch
Exact commit: $sha
Exact tree: $tree
Source archive: xenios-website-$shortSha.zip

## Snapshot contract

The zip is an exact committed-HEAD source snapshot with .xenios, .agents, .claude, attached_assets, environment files, machine credential files, Git metadata, dependencies, build output, coverage, caches, temporary files, logs, private-key files and other obvious secret-file paths removed. Included filenames and high-confidence credential markers were scanned before publication. Secret values are never printed by the packaging script.

$workingTreeNote

## Local startup

1. Extract the source archive.
2. Open PowerShell in the extracted repository.
3. Run powershell -ExecutionPolicy Bypass -File scripts/xenios-control/START_XENIOS.ps1.
4. Open http://127.0.0.1:4177/ if the browser does not open automatically.
5. Use scripts/xenios-control/STATUS_XENIOS.ps1 to inspect state and scripts/xenios-control/STOP_XENIOS.ps1 to stop only helper-owned processes.

When any of SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY or SITE_URL is not present, startup deliberately selects CLIENT_ONLY mode at http://127.0.0.1:5000/. Authentication, account, API-backed catalog, checkout and Care actions are then unavailable locally. No credential is fabricated.

## Commerce safety

Native checkout at packaging time: **$checkoutStatus**. Catalog summary: $catalogSummary The helper and cockpit cannot activate checkout or deploy to production.

## Production

Production URL: https://xeniostechnology.com
This artifact grants no production authority. Deployment, migration or other production mutations require Samuel's fresh explicit approval, the exact authorized SHA, prechecks, rollback and post-deploy smoke.
"@
  Set-Content -LiteralPath $handoffPath -Value $handoff -Encoding UTF8

  foreach ($helper in @('START_XENIOS.ps1', 'STOP_XENIOS.ps1', 'STATUS_XENIOS.ps1', 'PACKAGE_XENIOS.ps1', 'XeniosControl.Common.ps1')) {
    $committedHelper = Join-Path (Join-Path $stage 'scripts\xenios-control') $helper
    if (-not (Test-Path -LiteralPath $committedHelper -PathType Leaf)) {
      throw "Committed helper is missing from exact-SHA stage: $helper"
    }
    Copy-Item -LiteralPath $committedHelper -Destination (Join-Path $destination $helper) -Force
  }

  $zipInfo = Get-Item -LiteralPath $zipPath
  Write-Host "Package ready: $zipPath"
  Write-Host "Archive bytes: $($zipInfo.Length)"
  Write-Host "Handoff: $handoffPath"
  Write-Host 'Included filenames passed the secret-file scan; no secret values were printed.'
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    $verifiedTemp = Assert-XeniosChildPath -Parent $tempParent -Child $tempRoot
    Remove-Item -LiteralPath $verifiedTemp -Recurse -Force
  }
}
