Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:XeniosRequiredNodeVersion = '20.19.0'
$script:XeniosRequiredNpmVersion = '10.8.2'

function Resolve-XeniosToolchain {
  $candidates = New-Object System.Collections.Generic.List[object]
  if (-not [string]::IsNullOrWhiteSpace($env:XENIOS_NODE_HOME)) {
    $candidates.Add([pscustomobject]@{ Source = 'XENIOS_NODE_HOME'; Home = [System.IO.Path]::GetFullPath($env:XENIOS_NODE_HOME) })
  }
  $defaultHome = Join-Path $env:USERPROFILE '.codex\toolchains\node-v20.19.0-win-x64'
  $candidates.Add([pscustomobject]@{ Source = 'Codex pinned toolchain'; Home = [System.IO.Path]::GetFullPath($defaultHome) })

  try {
    $pathNode = (Get-Command node.exe -ErrorAction Stop).Source
    $pathNpm = (Get-Command npm.cmd -ErrorAction Stop).Source
    $candidates.Add([pscustomobject]@{ Source = 'PATH'; Home = Split-Path -Parent $pathNode; Node = $pathNode; Npm = $pathNpm })
  } catch { }

  $observed = New-Object System.Collections.Generic.List[string]
  foreach ($candidate in $candidates) {
    $nodePath = if ($candidate.PSObject.Properties['Node']) { $candidate.Node } else { Join-Path $candidate.Home 'node.exe' }
    $npmPath = if ($candidate.PSObject.Properties['Npm']) { $candidate.Npm } else { Join-Path $candidate.Home 'npm.cmd' }
    if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf) -or -not (Test-Path -LiteralPath $npmPath -PathType Leaf)) {
      $observed.Add("$($candidate.Source)=missing")
      continue
    }
    try {
      $nodeVersion = ((& $nodePath --version 2>$null | Select-Object -Last 1) -replace '^v', '').Trim()
      $npmManifest = Join-Path $candidate.Home 'node_modules\npm\package.json'
      if (-not (Test-Path -LiteralPath $npmManifest -PathType Leaf)) { throw 'npm manifest missing' }
      $npmVersion = [string](Get-Content -LiteralPath $npmManifest -Raw | ConvertFrom-Json).version
      if ($nodeVersion -eq $script:XeniosRequiredNodeVersion -and $npmVersion -eq $script:XeniosRequiredNpmVersion) {
        return [pscustomobject]@{
          Source = $candidate.Source
          Home = [System.IO.Path]::GetFullPath($candidate.Home)
          NodePath = [System.IO.Path]::GetFullPath($nodePath)
          NpmPath = [System.IO.Path]::GetFullPath($npmPath)
          NodeVersion = $nodeVersion
          NpmVersion = $npmVersion
        }
      }
      $observed.Add("$($candidate.Source)=node $nodeVersion / npm $npmVersion")
    } catch {
      $observed.Add("$($candidate.Source)=unusable")
    }
  }
  throw "Required Node $script:XeniosRequiredNodeVersion / npm $script:XeniosRequiredNpmVersion toolchain was not found. Checked: $($observed -join '; '). Set XENIOS_NODE_HOME to the exact toolchain directory."
}

function Get-XeniosRepoRoot {
  $scriptDirectory = [System.IO.Path]::GetFullPath($PSScriptRoot)
  $scriptParent = Split-Path -Parent $scriptDirectory
  $isInternalLayout = (Split-Path -Leaf $scriptDirectory) -eq 'xenios-control' -and (Split-Path -Leaf $scriptParent) -eq 'scripts'
  if ($isInternalLayout) {
    $internalCandidate = [System.IO.Path]::GetFullPath((Join-Path $scriptDirectory '..\..'))
    if (Test-Path -LiteralPath (Join-Path $internalCandidate 'package.json') -PathType Leaf) { return $internalCandidate }
  }
  if (Test-Path -LiteralPath (Join-Path $scriptDirectory 'package.json') -PathType Leaf) { return $scriptDirectory }
  $extractedCandidates = @(Get-ChildItem -LiteralPath $scriptDirectory -Directory -Force -ErrorAction SilentlyContinue | Where-Object {
    Test-Path -LiteralPath (Join-Path $_.FullName 'package.json') -PathType Leaf
  })
  if ($extractedCandidates.Count -eq 1) { return [System.IO.Path]::GetFullPath($extractedCandidates[0].FullName) }
  if ($extractedCandidates.Count -gt 1) {
    throw 'Multiple extracted Xenios repositories are next to this helper. Keep one here or run the helper inside the intended repository.'
  }
  throw 'Could not locate an extracted Xenios repository. Extract the source zip next to these helpers, or run the copy under scripts\xenios-control.'
}

function Get-XeniosRuntimeDirectory {
  param([Parameter(Mandatory = $true)][string]$RepoRoot)
  $normalized = [System.IO.Path]::GetFullPath($RepoRoot).ToLowerInvariant()
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($normalized)
    $digest = ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant().Substring(0, 12)
  } finally {
    $sha.Dispose()
  }
  $localRoot = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [System.IO.Path]::GetTempPath() }
  return Join-Path (Join-Path $localRoot 'XeniosControl') $digest
}

function Get-XeniosStatePath {
  param([Parameter(Mandatory = $true)][string]$RepoRoot)
  return Join-Path (Get-XeniosRuntimeDirectory -RepoRoot $RepoRoot) 'processes.json'
}

function Read-XeniosState {
  param([Parameter(Mandatory = $true)][string]$RepoRoot)
  $statePath = Get-XeniosStatePath -RepoRoot $RepoRoot
  if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) { return $null }
  try { return Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json } catch { return $null }
}

function Write-XeniosState {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)]$State
  )
  $statePath = Get-XeniosStatePath -RepoRoot $RepoRoot
  $runtime = Split-Path -Parent $statePath
  New-Item -ItemType Directory -Force -Path $runtime | Out-Null
  $temporary = "$statePath.$PID.tmp"
  $json = $State | ConvertTo-Json -Depth 8
  $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($temporary, $json + [Environment]::NewLine, $utf8WithoutBom)
  Move-Item -LiteralPath $temporary -Destination $statePath -Force
}

function Get-XeniosStateValue {
  param($State, [Parameter(Mandatory = $true)][string]$Name, $Default = $null)
  if ($null -eq $State) { return $Default }
  $property = $State.PSObject.Properties[$Name]
  if ($null -eq $property) { return $Default }
  return $property.Value
}

function Test-XeniosOwnedProcess {
  param(
    [AllowNull()][object]$ProcessId,
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string[]]$ExpectedFragments
  )
  if ($null -eq $ProcessId -or [int]$ProcessId -le 0) { return $false }
  try {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$ProcessId)" -ErrorAction Stop
    if ($null -eq $process -or [string]::IsNullOrWhiteSpace($process.CommandLine)) { return $false }
    $commandLine = $process.CommandLine.ToLowerInvariant()
    if (-not $commandLine.Contains(([System.IO.Path]::GetFullPath($RepoRoot)).ToLowerInvariant())) { return $false }
    foreach ($fragment in $ExpectedFragments) {
      if (-not $commandLine.Contains($fragment.ToLowerInvariant())) { return $false }
    }
    return $true
  } catch {
    return $false
  }
}

function Test-XeniosPort {
  param([Parameter(Mandatory = $true)][int]$Port)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $task = $client.ConnectAsync('127.0.0.1', $Port)
    if (-not $task.Wait(750)) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Test-XeniosUrl {
  param([Parameter(Mandatory = $true)][string]$Url)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Wait-XeniosUrl {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$TimeoutSeconds = 60
  )
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (Test-XeniosUrl -Url $Url) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Get-XeniosGitValue {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  $value = & git -C $RepoRoot @Arguments 2>$null
  if ($LASTEXITCODE -ne 0) { return 'unavailable' }
  return ($value -join "`n").Trim()
}

function Assert-XeniosChildPath {
  param(
    [Parameter(Mandatory = $true)][string]$Parent,
    [Parameter(Mandatory = $true)][string]$Child
  )
  $parentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  $childFull = [System.IO.Path]::GetFullPath($Child)
  if (-not $childFull.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing filesystem operation outside intended directory: $childFull"
  }
  return $childFull
}
