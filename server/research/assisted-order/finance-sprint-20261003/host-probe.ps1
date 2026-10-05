$ErrorActionPreference = 'Stop'
# Read-only host observations. A worktree is not compute isolation.
$samples = @()
for ($sampleIndex = 0; $sampleIndex -lt 3; $sampleIndex++) {
  if ($sampleIndex -gt 0) { Start-Sleep -Seconds 5 }
  $cpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object Name -eq '_Total'
  $memory = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
  $work = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -match 'vitest|typescript[\\/]bin|vite build|build[.]mjs|verification.+[.]mjs|npm.+ci'
  } | Select-Object ProcessId,ParentProcessId,ExecutablePath)
  $samples += [pscustomobject]@{
    at = [DateTime]::UtcNow.ToString('o')
    cpuPercent = $cpu.PercentProcessorTime
    availableMiB = $memory.AvailableMBytes
    pagesInputPerSecond = $memory.PagesInputPersec
    pagesOutputPerSecond = $memory.PagesOutputPersec
    testBuildProcesses = $work
  }
}
$quiet = @($samples | Where-Object {
  $null -eq $_.cpuPercent -or $_.cpuPercent -gt 15 -or
  $null -eq $_.availableMiB -or $_.availableMiB -lt 4096 -or
  $null -eq $_.pagesInputPerSecond -or $_.pagesInputPerSecond -gt 100 -or
  $null -eq $_.pagesOutputPerSecond -or $_.pagesOutputPerSecond -gt 100 -or
  $_.testBuildProcesses.Count -gt 0
}).Count -eq 0
[pscustomobject]@{
  schemaVersion = 1
  classification = $(if ($quiet) { 'QUIET_PRECHECK_ONLY' } else { 'LOADED_HOST_RACES_DEFERRED' })
  samples = $samples
  continuousHostAttestation = $false
  note = 'Three point samples do not prove an entire later run remained idle. Preserve in-run observations too.'
} | ConvertTo-Json -Depth 8
