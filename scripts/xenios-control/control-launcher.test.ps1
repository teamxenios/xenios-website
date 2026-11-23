[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$FixtureRoot
)

# Bounded regression of helper ownership against real, test-owned child processes.
# No listener, native coordinator, registry, connector or app process is started.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'XeniosControl.Common.ps1')

if (-not [System.IO.Path]::IsPathRooted($FixtureRoot)) { throw 'Absolute fixture directory required.' }
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Explicit Node executable required.' }
$FixtureRoot = [System.IO.Path]::GetFullPath($FixtureRoot)
$cases = [System.Collections.Generic.List[string]]::new()
function Assert-Case {
  param([Parameter(Mandatory = $true)][string]$Name, [Parameter(Mandatory = $true)][bool]$Passed)
  if (-not $Passed) { throw "Regression failed: $Name" }
  $cases.Add($Name)
}

$scripts = Join-Path $FixtureRoot 'scripts/xenios-control'
New-Item -ItemType Directory -Path $scripts -Force | Out-Null
$utf8 = [System.Text.UTF8Encoding]::new($false)
$fixtureBody = "const timer=setInterval(()=>{},1000);setTimeout(()=>{clearInterval(timer);process.exit(0)},20000);`n"
foreach ($name in @('server.mjs', 'control-room-server.mjs')) {
  $entry = Join-Path $scripts $name
  if (Test-Path -LiteralPath $entry) { throw 'Preserve the previous fixture; choose a new FixtureRoot.' }
  [System.IO.File]::WriteAllText($entry, $fixtureBody, $utf8)
}

Assert-Case -Name 'legacy entry is fixed' -Passed ((Get-XeniosControlEntry -RepoRoot $FixtureRoot -Mode 'cockpit') -eq (Join-Path $scripts 'server.mjs'))
Assert-Case -Name 'Control Room entry is fixed' -Passed ((Get-XeniosControlEntry -RepoRoot $FixtureRoot -Mode 'control-room') -eq (Join-Path $scripts 'control-room-server.mjs'))
$unknownRejected = $false
try { Get-XeniosControlEntry -RepoRoot $FixtureRoot -Mode '../arbitrary' | Out-Null } catch { $unknownRejected = $true }
Assert-Case -Name 'arbitrary entry mode refused' -Passed $unknownRejected
Assert-Case -Name 'missing state is unowned' -Passed (-not (Test-XeniosOwnedControlProcess -State $null -RepoRoot $FixtureRoot))

foreach ($mode in @('cockpit', 'control-room')) {
  $entry = Get-XeniosControlEntry -RepoRoot $FixtureRoot -Mode $mode
  $child = Start-Process -FilePath $NodePath -ArgumentList @('"' + $entry + '"') -WorkingDirectory $FixtureRoot -WindowStyle Hidden -PassThru
  try {
    $state = [pscustomobject]@{repoRoot=$FixtureRoot; controlPid=$child.Id; controlMode=$mode}
    $owned = $false
    $deadline = [DateTime]::UtcNow.AddSeconds(3)
    do {
      $owned = Test-XeniosOwnedControlProcess -State $state -RepoRoot $FixtureRoot
      if (-not $owned) { Start-Sleep -Milliseconds 50 }
    } while (-not $owned -and [DateTime]::UtcNow -lt $deadline)
    Assert-Case -Name "$mode real child recognized" -Passed $owned

    $otherMode = if ($mode -eq 'cockpit') { 'control-room' } else { 'cockpit' }
    $state.controlMode = $otherMode
    Assert-Case -Name "$mode cannot be claimed as $otherMode" -Passed (-not (Test-XeniosOwnedControlProcess -State $state -RepoRoot $FixtureRoot))
    $state.controlMode = 'server-from-untrusted-state.mjs'
    Assert-Case -Name "$mode unknown recorded mode refused" -Passed (-not (Test-XeniosOwnedControlProcess -State $state -RepoRoot $FixtureRoot))
    $state.controlMode = $mode
    $state.repoRoot = Join-Path $FixtureRoot 'different-repository'
    Assert-Case -Name "$mode different repository state refused" -Passed (-not (Test-XeniosOwnedControlProcess -State $state -RepoRoot $FixtureRoot))
    $state.repoRoot = $FixtureRoot

    $legacyState = [pscustomobject]@{repoRoot=$FixtureRoot;controlPid=$child.Id}
    $legacyOwned = Test-XeniosOwnedControlProcess -State $legacyState -RepoRoot $FixtureRoot
    Assert-Case -Name "$mode missing mode means legacy only" -Passed ($legacyOwned -eq ($mode -eq 'cockpit'))
    $state.controlPid = $null
    Assert-Case -Name "$mode absent PID refused" -Passed (-not (Test-XeniosOwnedControlProcess -State $state -RepoRoot $FixtureRoot))
  } finally {
    # This object is the exact fixture child returned above, never a PID from disk.
    $child.Refresh()
    if (-not $child.HasExited) { Stop-Process -Id $child.Id -ErrorAction Stop; $child.WaitForExit(3000) | Out-Null }
    $child.Dispose()
  }
}

# Reproduce extracted-source Git failure without consulting a parent repository.
$oldLocalAppData = $env:LOCALAPPDATA
$oldNodeHome = $env:XENIOS_NODE_HOME
$oldGitCeiling = $env:GIT_CEILING_DIRECTORIES
try {
  if (Test-Path -LiteralPath (Join-Path $FixtureRoot '.git')) { throw 'A non-Git test fixture root is required.' }
  $env:LOCALAPPDATA = Join-Path $FixtureRoot 'local-app-data'
  $env:XENIOS_NODE_HOME = Split-Path -Parent $NodePath
  $env:GIT_CEILING_DIRECTORIES = Split-Path -Parent $FixtureRoot
  [System.IO.File]::WriteAllText((Join-Path $FixtureRoot 'package.json'), "{}" + [Environment]::NewLine, $utf8)
  foreach ($name in @('STATUS_XENIOS.ps1', 'XeniosControl.Common.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $scripts $name) -ErrorAction Stop
  }
  $observedStatus = (& (Join-Path $scripts 'STATUS_XENIOS.ps1') *>&1 | Out-String)
  Assert-Case -Name 'unavailable Git is reported as unknown' -Passed ($observedStatus -match 'Working tree: UNKNOWN \(Git status unavailable\)')
  Assert-Case -Name 'unavailable Git is never reported as zero changes' -Passed ($observedStatus -notmatch 'Working tree: 0 change')
  Assert-Case -Name 'status did not create PID state' -Passed (-not (Test-Path -LiteralPath (Get-XeniosStatePath -RepoRoot $FixtureRoot)))
} finally {
  $env:LOCALAPPDATA = $oldLocalAppData
  $env:XENIOS_NODE_HOME = $oldNodeHome
  $env:GIT_CEILING_DIRECTORIES = $oldGitCeiling
}

[pscustomobject]@{
  kind='CONTROL_LAUNCHER_REAL_CHILD_OWNERSHIP_REGRESSION'
  status='PASS'
  passed=$cases.Count
  cases=$cases.ToArray()
  fixtureRoot=$FixtureRoot
  nativeFactoryStarted=$false
  listenersStarted=0
  canonicalStateWrites=0
  ownedFixtureChildrenStarted=2
  ownedFixtureChildrenStopped=2
} | ConvertTo-Json -Depth 4
