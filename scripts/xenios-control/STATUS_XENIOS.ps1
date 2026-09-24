[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'XeniosControl.Common.ps1')

$repoRoot = Get-XeniosRepoRoot
$state = Read-XeniosState -RepoRoot $repoRoot
$branch = Get-XeniosGitValue -RepoRoot $repoRoot -Arguments @('branch', '--show-current')
$sha = Get-XeniosGitValue -RepoRoot $repoRoot -Arguments @('rev-parse', '--short=12', 'HEAD')
$dirtyText = Get-XeniosGitValue -RepoRoot $repoRoot -Arguments @('status', '--porcelain=v1', '--untracked-files=normal')
$dirtyCount = if ([string]::IsNullOrWhiteSpace($dirtyText) -or $dirtyText -eq 'unavailable') { 0 } else { @($dirtyText -split "`n").Count }
$toolchain = $null
$toolchainError = $null
try { $toolchain = Resolve-XeniosToolchain } catch { $toolchainError = $_.Exception.Message }

$appPid = Get-XeniosStateValue -State $state -Name 'appPid'
$appFragment = Get-XeniosStateValue -State $state -Name 'appCommandFragment'
$appOwned = $false
if ($appPid -and $appFragment) { $appOwned = Test-XeniosOwnedProcess -ProcessId $appPid -RepoRoot $repoRoot -ExpectedFragments @([string]$appFragment) }
$controlPid = Get-XeniosStateValue -State $state -Name 'controlPid'
$controlEntry = Join-Path $repoRoot 'scripts\xenios-control\server.mjs'
$controlOwned = if ($controlPid) { Test-XeniosOwnedProcess -ProcessId $controlPid -RepoRoot $repoRoot -ExpectedFragments @($controlEntry) } else { $false }

$catalogPath = Join-Path $repoRoot 'docs\production-completion\catalog\catalog-reconciliation.json'
$checkout = 'UNKNOWN'
$catalogLine = 'Catalog reconciliation unavailable.'
if (Test-Path -LiteralPath $catalogPath -PathType Leaf) {
  try {
    $catalog = Get-Content -LiteralPath $catalogPath -Raw | ConvertFrom-Json
    $directBuy = [int]$catalog.counts.direct_buy
    $checkout = if ($directBuy -eq 0) { 'DARK' } else { 'REVIEW REQUIRED' }
    $catalogLine = "direct-buy=$directBuy assisted=$([int]$catalog.counts.assisted_order) care=$([int]$catalog.counts.care_required) unavailable=$([int]$catalog.counts.unavailable)"
  } catch { }
}

$requiredNames = @('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SITE_URL')
$missingNames = $requiredNames | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_, 'Process')) }
$runtime = Get-XeniosRuntimeDirectory -RepoRoot $repoRoot
$actionPath = Join-Path $runtime 'actions.json'
$lastBuild = 'No cockpit build result recorded.'
if (Test-Path -LiteralPath $actionPath -PathType Leaf) {
  try {
    $actions = Get-Content -LiteralPath $actionPath -Raw | ConvertFrom-Json
    $build = @($actions.history | Where-Object { $_.id -eq 'build' } | Select-Object -First 1)
    if ($build.Count -gt 0) { $lastBuild = "$($build[0].status) at $($build[0].finishedAt)" }
  } catch { }
}

Write-Host 'XENIOS LOCAL STATUS'
Write-Host "Repository : $repoRoot"
Write-Host "Branch/SHA : $branch / $sha"
Write-Host "Working tree: $dirtyCount change(s)"
Write-Host "Toolchain    : $(if ($toolchain) { 'Node ' + $toolchain.NodeVersion + ' / npm ' + $toolchain.NpmVersion + ' [' + $toolchain.Source + ']' } else { 'UNAVAILABLE - ' + $toolchainError })"
Write-Host "App         : $(if ($appOwned) { 'ONLINE / HELPER-OWNED' } elseif (Test-XeniosPort -Port 5000) { 'ONLINE / UNMANAGED' } else { 'OFFLINE' })"
Write-Host "App mode    : $(Get-XeniosStateValue -State $state -Name 'appMode' -Default 'UNKNOWN')"
Write-Host 'App URL     : http://127.0.0.1:5000/'
Write-Host "Cockpit     : $(if ($controlOwned) { 'ONLINE / HELPER-OWNED' } elseif (Test-XeniosPort -Port 4177) { 'ONLINE / UNMANAGED' } else { 'OFFLINE' })"
Write-Host 'Cockpit URL : http://127.0.0.1:4177/'
Write-Host "Checkout    : $checkout ($catalogLine)"
Write-Host "Server env  : $(if ($missingNames.Count -eq 0) { 'required names PRESENT (values hidden)' } else { 'missing names: ' + ($missingNames -join ', ') })"
Write-Host "Last build  : $lastBuild"
Write-Host 'Production  : https://xeniostechnology.com (link only; no deploy action)'
