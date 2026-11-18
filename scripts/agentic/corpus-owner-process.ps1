param(
  [Parameter(Mandatory = $true)][ValidateRange(1, 2147483647)][int]$OwnerProcessId,
  [Parameter(Mandatory = $true)][string]$AuthorityPath
)
$ErrorActionPreference = 'Stop'
try {
  if ($env:OS -ne 'Windows_NT') { throw 'unsupported platform' }
  $resolvedAuthority = [System.IO.Path]::GetFullPath($AuthorityPath)
  $drive = [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($resolvedAuthority))
  if (-not $drive.IsReady -or $drive.DriveType -ne [System.IO.DriveType]::Fixed -or $drive.DriveFormat -ne 'NTFS') { throw 'unsupported filesystem' }
  $operatingSystem = Get-CimInstance -ClassName Win32_OperatingSystem
  $owners = @(Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = {0}' -f $OwnerProcessId))
  if ($owners.Count -gt 1) { throw 'ambiguous process' }
  $found = $owners.Count -eq 1
  $result = [ordered]@{
    schemaVersion = 1
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
  '{"schemaVersion":1,"available":false,"code":"owner_observation_unavailable"}'
  exit 2
}
