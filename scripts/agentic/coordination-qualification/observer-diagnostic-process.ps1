param(
  [Parameter(Mandatory = $true)][ValidateRange(1, 2147483647)][int]$OwnerProcessId,
  [Parameter(Mandatory = $true)][string]$AuthorityPath
)
$ErrorActionPreference = 'Stop'
$observerStage = 'runtime'
try {
  try { [Console]::Error.WriteLine('XENIOS_OBSERVER_STAGE_V1 runtime_before') } catch { } # XENIOS_DIAGNOSTIC_INSERTION
  if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) { throw 'unsupported platform' }
  try { [Console]::Error.WriteLine('XENIOS_OBSERVER_STAGE_V1 runtime_after') } catch { } # XENIOS_DIAGNOSTIC_INSERTION
  $observerStage = 'authority_path'
  try { [Console]::Error.WriteLine('XENIOS_OBSERVER_STAGE_V1 authority_before') } catch { } # XENIOS_DIAGNOSTIC_INSERTION
  $resolvedAuthority = [System.IO.Path]::GetFullPath($AuthorityPath)
  $drive = [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($resolvedAuthority))
  try { [Console]::Error.WriteLine('XENIOS_OBSERVER_STAGE_V1 authority_after') } catch { } # XENIOS_DIAGNOSTIC_INSERTION
  $observerStage = 'fixed_ntfs'
  try { [Console]::Error.WriteLine('XENIOS_OBSERVER_STAGE_V1 fixed_ntfs_before') } catch { } # XENIOS_DIAGNOSTIC_INSERTION
  if (-not $drive.IsReady -or $drive.DriveType -ne [System.IO.DriveType]::Fixed -or $drive.DriveFormat -ne 'NTFS') { throw 'unsupported filesystem' }
  try { [Console]::Error.WriteLine('XENIOS_OBSERVER_STAGE_V1 fixed_ntfs_after') } catch { } # XENIOS_DIAGNOSTIC_INSERTION
  $observerStage = 'operating_system'
  try { [Console]::Error.WriteLine('XENIOS_OBSERVER_STAGE_V1 os_cim_before') } catch { } # XENIOS_DIAGNOSTIC_INSERTION
  $operatingSystem = Get-CimInstance -ClassName Win32_OperatingSystem
  try { [Console]::Error.WriteLine('XENIOS_OBSERVER_STAGE_V1 os_cim_after') } catch { } # XENIOS_DIAGNOSTIC_INSERTION
  $observerStage = 'process'
  try { [Console]::Error.WriteLine('XENIOS_OBSERVER_STAGE_V1 process_cim_before') } catch { } # XENIOS_DIAGNOSTIC_INSERTION
  $owners = @(Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = {0}' -f $OwnerProcessId))
  try { [Console]::Error.WriteLine('XENIOS_OBSERVER_STAGE_V1 process_cim_after') } catch { } # XENIOS_DIAGNOSTIC_INSERTION
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
  try { [Console]::Error.WriteLine('XENIOS_OBSERVER_STAGE_V1 serialization_before') } catch { } # XENIOS_DIAGNOSTIC_INSERTION
  $result | ConvertTo-Json -Compress
  try { [Console]::Error.WriteLine('XENIOS_OBSERVER_STAGE_V1 serialization_after') } catch { } # XENIOS_DIAGNOSTIC_INSERTION
} catch {
  try { [Console]::Error.WriteLine('XENIOS_OBSERVER_STAGE_V1 caught_error') } catch { } # XENIOS_DIAGNOSTIC_INSERTION
  [ordered]@{ schemaVersion = 1; available = $false; code = 'owner_observation_unavailable'; stage = $observerStage;
    exceptionType = $_.Exception.GetType().FullName; hresult = $_.Exception.HResult } | ConvertTo-Json -Compress
  exit 2
}
