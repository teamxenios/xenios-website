[CmdletBinding()]
param(
  [switch]$AppOnly,
  [switch]$ControlOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'XeniosControl.Common.ps1')

if ($AppOnly -and $ControlOnly) { throw 'Choose AppOnly or ControlOnly, not both.' }
$repoRoot = Get-XeniosRepoRoot
$state = Read-XeniosState -RepoRoot $repoRoot
if ($null -eq $state) {
  Write-Host 'No helper process state exists for this worktree. Nothing was stopped.'
  exit 0
}
if ((Get-XeniosStateValue -State $state -Name 'repoRoot') -ne $repoRoot) {
  throw 'The PID state belongs to a different repository path. Nothing was stopped.'
}

$stopApp = -not $ControlOnly
$stopControl = -not $AppOnly
$newState = [ordered]@{
  version = 1
  repoRoot = $repoRoot
  appPid = Get-XeniosStateValue -State $state -Name 'appPid'
  appMode = Get-XeniosStateValue -State $state -Name 'appMode' -Default 'OFFLINE'
  appStartedAt = Get-XeniosStateValue -State $state -Name 'appStartedAt'
  appCommandFragment = Get-XeniosStateValue -State $state -Name 'appCommandFragment'
  controlPid = Get-XeniosStateValue -State $state -Name 'controlPid'
  controlStartedAt = Get-XeniosStateValue -State $state -Name 'controlStartedAt'
  updatedAt = [DateTime]::UtcNow.ToString('o')
}

if ($stopApp) {
  $appPid = Get-XeniosStateValue -State $state -Name 'appPid'
  $fragment = Get-XeniosStateValue -State $state -Name 'appCommandFragment'
  if ($appPid -and $fragment -and (Test-XeniosOwnedProcess -ProcessId $appPid -RepoRoot $repoRoot -ExpectedFragments @([string]$fragment))) {
    Stop-Process -Id ([int]$appPid) -ErrorAction Stop
    Write-Host "Stopped helper-owned local app PID $appPid."
  } elseif ($appPid) {
    Write-Warning "App PID $appPid is absent or failed ownership verification; it was not stopped."
  }
  $newState.appPid = $null
  $newState.appMode = 'OFFLINE'
  $newState.appStartedAt = $null
  $newState.appCommandFragment = $null
}

if ($stopControl) {
  $controlPid = Get-XeniosStateValue -State $state -Name 'controlPid'
  $controlEntry = Join-Path $repoRoot 'scripts\xenios-control\server.mjs'
  if ($controlPid -and (Test-XeniosOwnedProcess -ProcessId $controlPid -RepoRoot $repoRoot -ExpectedFragments @($controlEntry))) {
    Stop-Process -Id ([int]$controlPid) -ErrorAction Stop
    Write-Host "Stopped helper-owned control cockpit PID $controlPid."
  } elseif ($controlPid) {
    Write-Warning "Control PID $controlPid is absent or failed ownership verification; it was not stopped."
  }
  $newState.controlPid = $null
  $newState.controlStartedAt = $null
}

Write-XeniosState -RepoRoot $repoRoot -State $newState
Write-Host 'No untracked or unverified process was terminated.'
