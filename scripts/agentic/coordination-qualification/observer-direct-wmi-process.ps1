# ISOLATED CANDIDATE. No caller selects this file without the owned preflight.
# Frozen production observer/core are unchanged; caller retains the8s deadline.
param(
  [Parameter(Mandatory = $true)][ValidateRange(1, 2147483647)][int]$OwnerProcessId,
  [Parameter(Mandatory = $true)][string]$AuthorityPath
)
$ErrorActionPreference = 'Stop'
$observerStage = 'runtime'
$osObject = $null
$processObject = $null
function Emit-Stage([string]$Stage) {
  try { [Console]::Error.WriteLine('XENIOS_DIRECT_WMI_STAGE ' + $Stage) } catch { }
}
function Exact-Utc([string]$Dmtf) {
  # Reject WMI wildcard/minimum-value conversions. Compare independent UTC
  # conversions so a local/DST ambiguity cannot silently change an owner birth.
  if ($Dmtf -cnotmatch '^\d{14}\.\d{6}[+-]\d{3}$') { throw 'unknown datetime' }
  $culture = [Globalization.CultureInfo]::InvariantCulture
  $wall = [DateTime]::ParseExact($Dmtf.Substring(0,21), 'yyyyMMddHHmmss.ffffff', $culture, [Globalization.DateTimeStyles]::None)
  $minutes = [int]::Parse($Dmtf.Substring(22,3), $culture)
  if ($Dmtf[21] -eq '-') { $minutes = -$minutes }
  $explicitUtc = [DateTimeOffset]::new($wall, [TimeSpan]::FromMinutes($minutes)).UtcDateTime.ToString('o', $culture)
  $managedUtc = [System.Management.ManagementDateTimeConverter]::ToDateTime($Dmtf).ToUniversalTime().ToString('o', $culture)
  if ($explicitUtc -cne $managedUtc -or $managedUtc -cnotmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}0Z$') { throw 'ambiguous datetime' }
  return $managedUtc
}
try {
  Emit-Stage 'runtime'
  try { [Console]::Error.WriteLine('XENIOS_DIRECT_WMI_PID ' + $PID) } catch { }
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'unsupported platform' }
  $observerStage = 'authority_path'
  Emit-Stage 'authority_path'
  $resolvedAuthority = [IO.Path]::GetFullPath($AuthorityPath)
  $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($resolvedAuthority))
  $observerStage = 'fixed_ntfs'
  Emit-Stage 'fixed_ntfs'
  if (-not $drive.IsReady -or $drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -ne 'NTFS') { throw 'unsupported filesystem' }
  $observerStage = 'management_assembly'
  Emit-Stage 'management_assembly'
  Add-Type -AssemblyName System.Management
  $observerStage = 'local_scope'
  Emit-Stage 'local_scope'
  $scope = [System.Management.ManagementScope]::new('\\.\root\cimv2')
  $scope.Options.Timeout = [TimeSpan]::FromSeconds(8)
  $scope.Connect()
  $getOptions = [System.Management.ObjectGetOptions]::new()
  $getOptions.Timeout = [TimeSpan]::FromSeconds(8)
  $observerStage = 'operating_system'
  Emit-Stage 'operating_system'
  $osObject = [System.Management.ManagementObject]::new($scope, [System.Management.ManagementPath]::new('Win32_OperatingSystem=@'), $getOptions)
  $osObject.Get()
  $bootId = Exact-Utc $osObject['LastBootUpTime']
  $observerStage = 'process'
  Emit-Stage 'process'
  $handleText = $OwnerProcessId.ToString([Globalization.CultureInfo]::InvariantCulture)
  $processObject = [System.Management.ManagementObject]::new($scope, [System.Management.ManagementPath]::new(('Win32_Process.Handle="{0}"' -f $handleText)), $getOptions)
  $found = $true
  try { $processObject.Get() } catch {
    # Only the exact process-instance not-found status establishes absence.
    # Namespace, connection, access, malformed response and timeout failures do not.
    $failure = $_.Exception
    while ($failure -and -not ($failure -is [System.Management.ManagementException])) { $failure = $failure.InnerException }
    if ($failure -and $failure.ErrorCode -eq [System.Management.ManagementStatus]::NotFound) { $found = $false }
    else { throw }
  }
  $birthId = $null
  if ($found) {
    if ([uint32]$processObject['ProcessId'] -ne [uint32]$OwnerProcessId -or [string]$processObject['Handle'] -cne $handleText) { throw 'process identity mismatch' }
    $birthId = Exact-Utc $processObject['CreationDate']
    $style = [Globalization.DateTimeStyles]::RoundtripKind
    $birthUtc = [DateTime]::ParseExact($birthId, 'o', [Globalization.CultureInfo]::InvariantCulture, $style)
    $bootUtc = [DateTime]::ParseExact($bootId, 'o', [Globalization.CultureInfo]::InvariantCulture, $style)
    if ($birthUtc -lt $bootUtc -or $birthUtc -gt [DateTime]::UtcNow) { throw 'invalid process time' }
  }
  $observerStage = 'serialization'
  Emit-Stage 'serialization'
  [ordered]@{schemaVersion=1;stage='complete';available=$true;platform='win32';hostId=[Environment]::MachineName;
    bootId=$bootId;fileSystem='NTFS';localFixedDrive=$true;pid=$OwnerProcessId;found=$found;birthId=$birthId} | ConvertTo-Json -Compress
} catch {
  [ordered]@{schemaVersion=1;available=$false;code='owner_observation_unavailable';stage=$observerStage;
    exceptionType=$_.Exception.GetType().FullName;hresult=$_.Exception.HResult} | ConvertTo-Json -Compress
  exit 2
} finally {
  foreach ($item in @($processObject,$osObject)) { if ($item) { try { $item.Dispose() } catch { } } }
}
