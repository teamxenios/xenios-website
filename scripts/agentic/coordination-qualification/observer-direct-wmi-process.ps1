# ISOLATED CANDIDATE. No caller selects this file without the owned preflight.
# Frozen production observer/core are unchanged; caller retains the8s deadline.
param(
  [Parameter(Mandatory = $true)][ValidateRange(1, 2147483647)][int]$OwnerProcessId,
  [Parameter(Mandatory = $true)][string]$AuthorityPath
)
$ErrorActionPreference = 'Stop'
$observerStage = 'runtime'
$candidateClock = [Diagnostics.Stopwatch]::StartNew()
$osObject = $null
$processObject = $null
function Emit-Stage([string]$Stage) {
  try { [Console]::Error.WriteLine('XENIOS_DIRECT_WMI_STAGE ' + $Stage) } catch { }
  try { [Console]::Error.WriteLine('XENIOS_DIRECT_WMI_ELAPSED ' + $Stage + ' ' + $candidateClock.ElapsedMilliseconds.ToString([Globalization.CultureInfo]::InvariantCulture)) } catch { }
}
function Json-String([object]$Value) {
  if ($null -eq $Value) { return 'null' }
  if ($Value -isnot [string]) { throw 'unsupported JSON string' }
  $builder = [Text.StringBuilder]::new()
  [void]$builder.Append('"')
  foreach ($character in $Value.ToCharArray()) {
    $code = [int]$character
    if ($code -eq 34) { [void]$builder.Append('\"') }
    elseif ($code -eq 92) { [void]$builder.Append('\\') }
    elseif ($code -lt 32 -or $code -ge 127) {
      [void]$builder.Append('\u')
      [void]$builder.Append($code.ToString('x4', [Globalization.CultureInfo]::InvariantCulture))
    } else { [void]$builder.Append($character) }
  }
  [void]$builder.Append('"')
  return $builder.ToString()
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
  $observerStage = 'serializer_selfcheck'
  Emit-Stage 'serializer_selfcheck'
  # Fixed schema uses only mscorlib primitives. No module or arbitrary object
  # serializer is needed, including on the failure path before WMI is loaded.
  if ((Json-String $null) -cne 'null' -or (Json-String '') -cne '""' -or
      (Json-String 'a"b\c') -cne '"a\"b\\c"' -or
      (Json-String ([string][char]10)) -cne '"\u000a"' -or
      (Json-String ([string][char]0x263a)) -cne '"\u263a"') { throw 'JSON selfcheck failed' }
  $observerStage = 'management_assembly'
  Emit-Stage 'management_assembly'
  # Full-name default-context binding and a GAC/identity check are specific to
  # Windows PowerShell's .NET Framework4 runtime. No explicit path/partial-name
  # fallback; default-context resolution must return the verified GAC assembly.
  # https://learn.microsoft.com/dotnet/framework/deployment/best-practices-for-assembly-loading
  $managementIdentity = 'System.Management, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'
  Emit-Stage 'management_load_before'
  $managementAssembly = [Reflection.Assembly]::Load($managementIdentity)
  Emit-Stage 'management_load_after'
  $assemblyName = $managementAssembly.GetName()
  $assemblyToken = [BitConverter]::ToString($assemblyName.GetPublicKeyToken()).Replace('-','').ToLowerInvariant()
  if (-not $managementAssembly.GlobalAssemblyCache -or $managementAssembly.IsDynamic -or
      -not [StringComparer]::OrdinalIgnoreCase.Equals($managementAssembly.FullName, $managementIdentity) -or
      $assemblyName.Name -cne 'System.Management' -or $assemblyName.Version.ToString() -cne '4.0.0.0' -or
      $assemblyToken -cne 'b03f5f7f11d50a3a') { throw 'untrusted management assembly' }
  foreach ($requiredType in @([System.Management.ManagementScope], [System.Management.ManagementPath],
      [System.Management.ObjectGetOptions], [System.Management.ManagementObject],
      [System.Management.ManagementDateTimeConverter], [System.Management.ManagementException])) {
    if (-not [Object]::ReferenceEquals($requiredType.Assembly, $managementAssembly)) { throw 'management type assembly mismatch' }
  }
  Emit-Stage 'management_identity_validated'
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
  $foundJson = if ($found) { 'true' } else { 'false' }
  $output = '{"schemaVersion":1,"stage":"complete","available":true,"platform":"win32","hostId":' + (Json-String ([Environment]::MachineName)) +
    ',"bootId":' + (Json-String $bootId) + ',"fileSystem":"NTFS","localFixedDrive":true,"pid":' + $handleText +
    ',"found":' + $foundJson + ',"birthId":' + (Json-String $birthId) + '}'
  [Console]::Out.WriteLine($output)
  Emit-Stage 'serialization_after'
} catch {
  $output = '{"schemaVersion":1,"available":false,"code":"owner_observation_unavailable","stage":' + (Json-String $observerStage) +
    ',"exceptionType":' + (Json-String $_.Exception.GetType().FullName) + ',"hresult":' + $_.Exception.HResult.ToString([Globalization.CultureInfo]::InvariantCulture) + '}'
  [Console]::Out.WriteLine($output)
  exit 2
} finally {
  foreach ($item in @($processObject,$osObject)) { if ($item) { try { $item.Dispose() } catch { } } }
}
