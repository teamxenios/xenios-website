# Correction to Doc 146 section 6, repair A

**CORRECTED. Doc 146 overstated the documentation.** It said `Win32_OperatingSystem.FreeVirtualMemory` is
"documented as unused available virtual memory, that is, commit limit minus commit charge". The second half was my
inference, not documentation. The documentation does not establish that equality. Repair A as written therefore
does not preserve the system-commit floor.

Doc 146's acceptance of the diagnostic stands: completeness, timestamp method, known-process closure and the
blocking predicate. Only section 6's repair A changes.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only. This lane
excludes HTTP actions, so I did not fetch the cited pages. The points below rest on the documentation's text as Root
quoted it and as I know it, and they agree. Archive: `hl12/147_doc146_repair_a_precision_correction.json`.

## What the documentation supports

- **`FreeVirtualMemory`** is defined only as virtual memory "currently unused and available", in kilobytes. Its
  inherited `CIM_OperatingSystem` definition gives free RAM plus free paging space as an example. That example is
  not the system commit limit minus the system commit charge, and nothing maps the two.
- **`MEMORYSTATUSEX.ullAvailPageFile`** is the commit the current process can make. It is at most the system-wide
  figure, and the documentation directs callers to `GetPerformanceInfo`, `CommitLimit − CommitTotal`, for the
  system-wide value. So even the documented API that resembles `FreeVirtualMemory` is process-limited.
- **`PERFORMANCE_INFORMATION`** reports commit and physical figures in pages, with `PageSize`. System commit headroom
  is `(CommitLimit − CommitTotal) × PageSize`, and available physical memory is `PhysicalAvailable × PageSize`.

## Corrected statements

1. **System commit.** It cannot be taken from `FreeVirtualMemory` on documentary grounds. This is an equivalence gap,
   not a measurement showing the values differ on this host. A repair that keeps the system-commit floor needs a
   documented system-wide source: `GetPerformanceInfo`, or the existing performance counters if they can be read in
   time.
2. **Physical memory.** Doc 146 said `FreePhysicalMemory` tracked the counter's `AvailableBytes` within 15–63 MiB in
   three runs, so it is the same quantity. The three samples are real, but they are only empirical closeness. The
   documentation does not state that equality, and similar physical readings say nothing about commit. A repair
   should keep the existing operating-system physical check and add a documented available-physical source, rather
   than treat one as the other.
3. **Refusals stay.** The repair must keep both floors, physical and system commit, at 512 MiB, plus the existing
   refusals for failure, missing, invalid and late reads.

Doc 146's repair B, the longer bound, is unaffected by this correction.

Not execution consent or source authority.
