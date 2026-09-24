[CmdletBinding()]
param(
  [switch]$NoBrowser,
  [switch]$AppOnly,
  [switch]$ControlOnly,
  [switch]$RestartApp
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'XeniosControl.Common.ps1')

if ($AppOnly -and $ControlOnly) { throw 'Choose AppOnly or ControlOnly, not both.' }
if ($RestartApp -and $ControlOnly) { throw 'RestartApp cannot be combined with ControlOnly.' }

$repoRoot = Get-XeniosRepoRoot
$packageJson = Join-Path $repoRoot 'package.json'
if (-not (Test-Path -LiteralPath $packageJson -PathType Leaf)) { throw "package.json not found at $repoRoot" }

$branch = Get-XeniosGitValue -RepoRoot $repoRoot -Arguments @('branch', '--show-current')
$sha = Get-XeniosGitValue -RepoRoot $repoRoot -Arguments @('rev-parse', '--short=12', 'HEAD')
$toolchain = Resolve-XeniosToolchain
$env:PATH = "$($toolchain.Home);$env:PATH"
Write-Host "Xenios repository: $repoRoot"
Write-Host "Branch / SHA: $branch / $sha"
Write-Host "Toolchain  : Node $($toolchain.NodeVersion) / npm $($toolchain.NpmVersion) [$($toolchain.Source)]"

if ($RestartApp) {
  & (Join-Path $PSScriptRoot 'STOP_XENIOS.ps1') -AppOnly
}

$startApp = -not $ControlOnly
$startControl = -not $AppOnly
$runtime = Get-XeniosRuntimeDirectory -RepoRoot $repoRoot
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$prior = Read-XeniosState -RepoRoot $repoRoot

$state = [ordered]@{
  version = 1
  repoRoot = $repoRoot
  appPid = Get-XeniosStateValue -State $prior -Name 'appPid'
  appMode = Get-XeniosStateValue -State $prior -Name 'appMode' -Default 'OFFLINE'
  appStartedAt = Get-XeniosStateValue -State $prior -Name 'appStartedAt'
  appCommandFragment = Get-XeniosStateValue -State $prior -Name 'appCommandFragment'
  controlPid = Get-XeniosStateValue -State $prior -Name 'controlPid'
  controlStartedAt = Get-XeniosStateValue -State $prior -Name 'controlStartedAt'
  updatedAt = [DateTime]::UtcNow.ToString('o')
}

if ($startApp) {
  $viteCli = Join-Path $repoRoot 'node_modules\vite\bin\vite.js'
  $tsxCli = Join-Path $repoRoot 'node_modules\tsx\dist\cli.mjs'
  if (-not (Test-Path -LiteralPath $viteCli -PathType Leaf) -or -not (Test-Path -LiteralPath $tsxCli -PathType Leaf)) {
    Write-Host 'Dependencies are missing; running the supported npm install once.'
    Push-Location -LiteralPath $repoRoot
    try {
      & $toolchain.NpmPath install --no-audit --no-fund --production=false
      if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
    } finally {
      Pop-Location
    }
  }

  $existingPid = Get-XeniosStateValue -State $prior -Name 'appPid'
  $existingFragment = Get-XeniosStateValue -State $prior -Name 'appCommandFragment'
  $ownedRunning = $false
  if ($existingFragment) {
    $ownedRunning = Test-XeniosOwnedProcess -ProcessId $existingPid -RepoRoot $repoRoot -ExpectedFragments @([string]$existingFragment)
  }

  if ($ownedRunning) {
    Write-Host "Local app is already helper-managed (PID $existingPid)."
  } else {
    if (Test-XeniosPort -Port 5000) {
      if ($AppOnly -or $RestartApp) {
        throw 'Port 5000 is already in use by a process this helper does not own. It will not be stopped or replaced.'
      }
      Write-Warning 'Port 5000 is already served by an unmanaged process. It will be left untouched while the control cockpit starts.'
      $state.appPid = $null
      $state.appMode = 'UNMANAGED_OR_UNKNOWN'
      $state.appStartedAt = $null
      $state.appCommandFragment = $null
      Write-XeniosState -RepoRoot $repoRoot -State $state
    } else {
      $missingServerNames = @('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SITE_URL') | Where-Object {
        [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_, 'Process'))
      }
      $node = $toolchain.NodePath
      $stdout = Join-Path $runtime 'app.stdout.log'
      $stderr = Join-Path $runtime 'app.stderr.log'
      if ($missingServerNames.Count -eq 0) {
        $mode = 'FULL_SERVER'
        $entry = Join-Path $repoRoot 'server\index.ts'
        $arguments = @($tsxCli, $entry)
        $fragment = $entry
        $oldNodeEnv = $env:NODE_ENV
        $oldPort = $env:PORT
        $env:NODE_ENV = 'development'
        $env:PORT = '5000'
        try {
          $process = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $repoRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
        } finally {
          $env:NODE_ENV = $oldNodeEnv
          $env:PORT = $oldPort
        }
        Write-Host 'Full local server selected (required variable names are present; values were not inspected or printed).'
      } else {
        $mode = 'CLIENT_ONLY'
        $arguments = @($viteCli, '--host', '127.0.0.1', '--port', '5000', '--strictPort')
        $fragment = $viteCli
        $process = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $repoRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
        Write-Warning "Full server prerequisites are unavailable: $($missingServerNames -join ', ') are not present. Starting client-only Vite; API-backed features remain unavailable."
      }
      $state.appPid = $process.Id
      $state.appMode = $mode
      $state.appStartedAt = [DateTime]::UtcNow.ToString('o')
      $state.appCommandFragment = $fragment
      Write-XeniosState -RepoRoot $repoRoot -State $state
      if (-not (Wait-XeniosUrl -Url 'http://127.0.0.1:5000/' -TimeoutSeconds 60)) {
        throw "Local app did not become ready. Inspect $stderr"
      }
      Write-Host "Local app ready: http://127.0.0.1:5000/ [$mode]"
    }
  }
}

if ($startControl) {
  $controlEntry = Join-Path $repoRoot 'scripts\xenios-control\server.mjs'
  $existingControlPid = Get-XeniosStateValue -State $prior -Name 'controlPid'
  $controlRunning = Test-XeniosOwnedProcess -ProcessId $existingControlPid -RepoRoot $repoRoot -ExpectedFragments @($controlEntry)
  if ($controlRunning) {
    Write-Host "Control cockpit is already helper-managed (PID $existingControlPid)."
  } else {
    if (Test-XeniosPort -Port 4177) {
      throw 'Port 4177 is already in use by a process this helper does not own. It will not be stopped or replaced.'
    }
    $node = $toolchain.NodePath
    $controlStdout = Join-Path $runtime 'control.stdout.log'
    $controlStderr = Join-Path $runtime 'control.stderr.log'
    $controlProcess = Start-Process -FilePath $node -ArgumentList @($controlEntry) -WorkingDirectory $repoRoot -RedirectStandardOutput $controlStdout -RedirectStandardError $controlStderr -WindowStyle Hidden -PassThru
    $state.controlPid = $controlProcess.Id
    $state.controlStartedAt = [DateTime]::UtcNow.ToString('o')
    $state.updatedAt = [DateTime]::UtcNow.ToString('o')
    Write-XeniosState -RepoRoot $repoRoot -State $state
    if (-not (Wait-XeniosUrl -Url 'http://127.0.0.1:4177/api/health' -TimeoutSeconds 30)) {
      throw "Control cockpit did not become ready. Inspect $controlStderr"
    }
    Write-Host 'Control cockpit ready: http://127.0.0.1:4177/'
  }
}

$state.updatedAt = [DateTime]::UtcNow.ToString('o')
Write-XeniosState -RepoRoot $repoRoot -State $state

if (-not $NoBrowser -and $startControl) {
  Start-Process 'http://127.0.0.1:4177/'
}

Write-Host 'Use STATUS_XENIOS.ps1 for current status and STOP_XENIOS.ps1 to stop only helper-owned processes.'
