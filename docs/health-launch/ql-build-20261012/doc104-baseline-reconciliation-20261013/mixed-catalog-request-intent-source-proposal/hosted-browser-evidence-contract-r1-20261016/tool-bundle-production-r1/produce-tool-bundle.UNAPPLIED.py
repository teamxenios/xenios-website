#!/usr/bin/env python3
"""UNAPPLIED, source-only bounded Linux tool preparation; no browser/test launch."""
import base64, hashlib, io, json, os, pathlib, platform, stat, sys, tarfile, time, urllib.request, zipfile

VERSION="1.61.1"
BROWSER_VERSION="149.0.7827.55"
REVISION="1228"
PACKAGES=[
 ("playwright","https://registry.npmjs.org/playwright/-/playwright-1.61.1.tgz",
  "DWnY5o3YbLWK4GovuAVwpqL+1VwGNdUGrRr++8j8PtQQzvAVZUIMjKQ90fY689sEJZJBbZVw1rXaOKSTitkzPQ=="),
 ("playwright-core","https://registry.npmjs.org/playwright-core/-/playwright-core-1.61.1.tgz",
  "h7Qlt6m4REp25qvIdvbDtVmD4LqVXfpRxhORv9L0jzETM05p4fuPJ3dKyuSXQxDSbXnmS79HAgi9589lGSpLkg==")]
BROWSER_URL=("https://storage.googleapis.com/chrome-for-testing-public/"
             +BROWSER_VERSION+"/linux64/chrome-headless-shell-linux64.zip")
MAX_DOWNLOAD=268435456
MAX_TOTAL_DOWNLOAD=536870912
MAX_UNPACKED=1610612736
MAX_FILES=100000
MAX_SECONDS=600
started=time.monotonic()
total_download=0
total_unpacked=0
files=0
downloads=[]
phase="ADMISSION"
def demand(ok,code):
    if not ok: raise RuntimeError(code)
def deadline():
    demand(time.monotonic()-started<MAX_SECONDS,"PREPARATION_DEADLINE")
def sha(data):
    return hashlib.sha256(data).hexdigest()
def encode(value):
    return (json.dumps(value,ensure_ascii=False,indent=2)+"\n").encode("utf-8")
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        raise RuntimeError("REDIRECT_REFUSED")
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
def download(url):
    global total_download
    deadline()
    # Exact fixed URLs only; no environment auth, netrc, proxy, credentials or retries.
    demand(url in [p[1] for p in PACKAGES]+[BROWSER_URL],"URL_REFUSED")
    result=bytearray()
    with opener.open(urllib.request.Request(url,headers={"User-Agent":"Xenios-approved-tool-preparation/1"}),
                     timeout=20) as response:
        demand(response.status==200 and response.url==url,"DOWNLOAD_IDENTITY")
        while True:
            deadline()
            chunk=response.read(1048576)
            if not chunk: break
            result.extend(chunk);total_download+=len(chunk)
            demand(len(result)<=MAX_DOWNLOAD and total_download<=MAX_TOTAL_DOWNLOAD,"DOWNLOAD_CAP")
    data=bytes(result)
    downloads.append({"url":url,"bytes":len(data),"sha256":sha(data)})
    return data
def relative(name):
    demand("\\" not in name,"ARCHIVE_BACKSLASH")
    p=pathlib.PurePosixPath(name)
    demand(not p.is_absolute() and ".." not in p.parts and str(p)!=".","ARCHIVE_PATH")
    return p
def write_file(base,name,data,mode=0o644):
    global total_unpacked,files
    deadline();p=relative(name)
    total_unpacked+=len(data);files+=1
    demand(files<=MAX_FILES and total_unpacked<=MAX_UNPACKED,"UNPACK_CAP")
    target=base/pathlib.Path(*p.parts)
    target.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
    with target.open("xb") as f: f.write(data)
    os.chmod(target,mode)
def package(base,name,data,sri):
    demand(base64.b64encode(hashlib.sha512(data).digest()).decode("ascii")==sri,"NPM_SRI")
    with tarfile.open(fileobj=io.BytesIO(data),mode="r:gz") as archive:
        seen=set()
        for item in archive:
            deadline();p=relative(item.name)
            demand(p.parts[0]=="package","NPM_PACKAGE_PREFIX")
            if item.isdir(): continue
            demand(item.isfile() and not item.issym() and not item.islnk(),"NPM_SPECIAL_MEMBER")
            rel=pathlib.PurePosixPath(*p.parts[1:]).as_posix()
            demand(rel not in seen,"NPM_DUPLICATE");seen.add(rel)
            demand(item.size<=MAX_UNPACKED-total_unpacked,"NPM_SIZE")
            stream=archive.extractfile(item)
            demand(stream is not None,"NPM_MISSING_MEMBER")
            payload=stream.read(item.size+1)
            demand(len(payload)==item.size,"NPM_MEMBER_LENGTH")
            write_file(base/"node_modules"/name,rel,payload)
    metadata=json.loads((base/"node_modules"/name/"package.json").read_text("utf-8"))
    demand(metadata["name"]==name and metadata["version"]==VERSION,"NPM_METADATA_PIN")
def browser(base,data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        members=archive.infolist()
        demand(len(members)<=MAX_FILES and sum(x.file_size for x in members)<=MAX_UNPACKED-total_unpacked,
               "BROWSER_UNPACK_CAP")
        seen=set()
        for item in members:
            deadline();p=relative(item.filename)
            demand(p.parts[0]=="chrome-headless-shell-linux64","BROWSER_ROOT")
            demand(item.filename not in seen,"BROWSER_DUPLICATE");seen.add(item.filename)
            demand(not stat.S_ISLNK(item.external_attr>>16),"BROWSER_SYMLINK")
            if item.is_dir(): continue
            # Preserve only the archive's executable bit; strip write-for-others/setid.
            mode=0o755 if (item.external_attr>>16)&0o111 else 0o644
            if p.name=="chrome-headless-shell": mode=0o755
            payload=archive.read(item)
            write_file(base/"browsers"/("chromium_headless_shell-"+REVISION),item.filename,payload,mode)
def main():
    global phase
    demand(platform.system()=="Linux" and platform.machine() in ("x86_64","AMD64"),"LINUX_X64_ONLY")
    mem=dict(line.split(":",1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
    available_mib=int(mem['MemAvailable'].strip().split()[0])/1024
    demand(available_mib>=4096,"TOOL_PREPARATION_MEMORY_FLOOR")
    temp=os.environ.get("RUNNER_TEMP")
    demand(temp and len(sys.argv)==2,"EXACT_RUNNER_SCRATCH_REQUIRED")
    parent=pathlib.Path(temp).resolve()
    out=pathlib.Path(sys.argv[1]).resolve()
    demand(out.parent==parent and out.name=="kan31-tool-bundle-r1" and not out.exists(),"FRESH_EXACT_OUTPUT")
    out.mkdir(mode=0o700)
    tools=out/"tools";tools.mkdir(mode=0o755)
    for name,url,sri in PACKAGES:
        phase="PACKAGE_"+name.replace("-","_").upper()
        package(tools,name,download(url),sri)
    phase="BROWSER_METADATA"
    bjson=json.loads((tools/"node_modules/playwright-core/browsers.json").read_text("utf-8"))
    pin=next(x for x in bjson["browsers"] if x["name"]=="chromium-headless-shell")
    demand(pin["revision"]==REVISION and pin["browserVersion"]==BROWSER_VERSION,"BROWSER_PACKAGE_PIN")
    phase="BROWSER_DOWNLOAD_EXTRACT"
    browser(tools,download(BROWSER_URL))
    executable="browsers/chromium_headless_shell-"+REVISION+"/chrome-headless-shell-linux64/chrome-headless-shell"
    demand((tools/executable).is_file(),"BROWSER_EXECUTABLE_MISSING")
    phase="INVENTORY"
    inventory=[]
    for f in sorted(tools.rglob("*")):
        deadline()
        demand(not f.is_symlink(),"OUTPUT_SYMLINK")
        if not f.is_file(): continue
        data=f.read_bytes()
        inventory.append({"path":f.relative_to(tools).as_posix(),"bytes":len(data),
                          "mode":stat.S_IMODE(f.stat().st_mode),"sha256":sha(data)})
    inv=encode(inventory);(out/"tool-inventory.json").write_bytes(inv)
    pins={"playwrightVersion":VERSION,"browserVersion":BROWSER_VERSION,"browserRevision":REVISION,
          "playwrightEntry":"node_modules/playwright/index.mjs",
          "playwrightEntrySha256":sha((tools/"node_modules/playwright/index.mjs").read_bytes()),
          "playwrightPackageJson":"node_modules/playwright/package.json",
          "browserPath":executable,"browserSha256":sha((tools/executable).read_bytes()),
          "inventorySha256":sha(inv),"acceptanceReference":None}
    (out/"toolchain-pins.UNACCEPTED.json").write_bytes(encode(pins))
    receipt={"status":"TOOLS_PREPARED_NOT_ACCEPTED_NOT_EXECUTED","sourceOnlyBeforeInvocation":False,
             "nodeRequirement":"v20.19.0","npmRequirement":"10.8.2",
             "downloads":downloads,"files":len(inventory),"downloadBytes":total_download,
             "unpackedBytes":total_unpacked,"elapsedSeconds":time.monotonic()-started,
             "availableMiBAtAdmission":available_mib,"minimumMiB":4096,
             "browserLaunched":False,"testsRun":False,"lifecycleScriptsRun":False,
             "applicationTouched":False,"credentialsRead":False}
    (out/"preparation-receipt.json").write_bytes(encode(receipt))
    # Transport ZIP: exact accepted consumer roots only; Root later adds reviewed
    # fresh run-manifest/provider-proof to a separate qualification-input artifact.
    phase="TRANSPORT_ZIP"
    bundle=out/"tool-payload.zip"
    with zipfile.ZipFile(bundle,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=1) as z:
        for f in [out/"tool-inventory.json"]+[tools/pathlib.Path(x["path"]) for x in inventory]:
            deadline()
            info=zipfile.ZipInfo(f.relative_to(out).as_posix(),date_time=(2026,1,1,0,0,0))
            info.create_system=3;info.external_attr=(stat.S_IFREG|stat.S_IMODE(f.stat().st_mode))<<16
            info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,f.read_bytes())
    digest=sha(bundle.read_bytes())
    demand(bundle.stat().st_size<=536870912,"PAYLOAD_ZIP_CAP")
    (out/"tool-payload.sha256").write_text(digest+"  tool-payload.zip\n",encoding="ascii")
    print(json.dumps({"status":receipt["status"],"payloadSha256":digest,
                      "inventorySha256":pins["inventorySha256"],"files":len(inventory)}))
try:
    main()
except Exception as error:
    # Preserve partial output; no automatic retry or recursive cleanup.
    code=str(error) if isinstance(error,RuntimeError) else "OPERATION_FAILED"
    if not code or any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ_" for c in code): code="OPERATION_FAILED"
    print(json.dumps({"status":"TOOL_PREPARATION_FAILED_SANITIZED","phase":phase,
                      "code":code,"retryAuthorized":False}))
    sys.exit(1)
