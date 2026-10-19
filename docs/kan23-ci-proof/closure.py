import json, os, pathlib, shutil, socket, sys
home=pathlib.Path(sys.argv[1]); evidence=pathlib.Path(sys.argv[2]); evidence.mkdir(exist_ok=False)
survivors=[]
for p in pathlib.Path('/proc').iterdir():
    if not p.name.isdigit() or int(p.name)==os.getpid(): continue
    try:
        args=(p/'cmdline').read_bytes().split(b'\0')
        if any((str(home)+'/fresh-browser-profile').encode() in a for a in args): survivors.append(int(p.name))
    except (FileNotFoundError, PermissionError, ProcessLookupError): pass
listener_closed=False
try:
    with socket.socket() as s: s.bind(('127.0.0.1',5239)); listener_closed=True
except OSError: pass
receipt={'survivingProfileProcesses':survivors,'listenerClosed':listener_closed,'scope':'independent post-parent process/profile and listener check; no blanket system-process claim'}
allowed=[home/'static-build-receipt-2f4ff3e.json',home/'static-client-manifest-2f4ff3e.json',home/'browser-static-proof-2f4ff3e/report.json']
allowed += [home/'browser-static-proof-2f4ff3e'/('viewport-'+str(w)+'.png') for w in [320,360,390,768,1280]]
allowed += [home/'browser-static-proof-2f4ff3e/zoom-200.png']
files=[p for p in allowed if p.is_file() and not p.is_symlink()]
total=sum(p.stat().st_size for p in files)
receipt['evidenceBytes']=total;receipt['evidenceCapBytes']=20*1024*1024
# Reserve 1MiB for closure/provision metadata; never export the profile/archive/build.
if total<=19*1024*1024:
    for p in files: shutil.copyfile(p,evidence/p.name)
(evidence/'closure.json').write_text(json.dumps(receipt,indent=2))
assert total<=19*1024*1024,'Evidence exceeds payload cap; payload not copied'
assert listener_closed and not survivors,'Browser/listener closure failed'
