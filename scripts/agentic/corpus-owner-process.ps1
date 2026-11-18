param(
  [Parameter(Mandatory = $true)][ValidateRange(1, 2147483647)][int]$OwnerProcessId,
  [Parameter(Mandatory = $true)][string]$AuthorityPath
)
$ErrorActionPreference = 'Stop'
$observerStage = 'runtime'
try {
  if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) { throw 'unsupported platform' }
  $observerStage = 'authority_path'
  $resolvedAuthority = [System.IO.Path]::GetFullPath($AuthorityPath)
  $drive = [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($resolvedAuthority))
  $observerStage = 'fixed_ntfs'
  if (-not $drive.IsReady -or $drive.DriveType -ne [System.IO.DriveType]::Fixed -or $drive.DriveFormat -ne 'NTFS') { throw 'unsupported filesystem' }
  $observerStage = 'operating_system'
  $operatingSystem = Get-CimInstance -ClassName Win32_OperatingSystem
  $observerStage = 'process'
  $owners = @(Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = {0}' -f $OwnerProcessId))
  if ($owners.Count -gt 1) { throw 'ambiguous process' }
  $found = $owners.Count -eq 1
  $result = [ordered]@{
    schemaVersion = 1
    stage = 'complete'
    available = $true
    platform = 'win32'
    hostId = [Environment]::MachineName
    bootId = $operatingSystem.LastBootUpTime.ToUniversalTime().ToString('o')
    fileSystem = 'NTFS'
    localFixedDrive = $true
    pid = $OwnerProcessId
    found = $found
    birthId = if ($found) { $owners[0].CreationDate.ToUniversalTime().ToString('o') } else { $null }
  }
  $result | ConvertTo-Json -Compress
} catch {
  [ordered]@{ schemaVersion = 1; available = $false; code = 'owner_observation_unavailable'; stage = $observerStage;
    exceptionType = $_.Exception.GetType().FullName; hresult = $_.Exception.HResult } | ConvertTo-Json -Compress
  exit 2
}
