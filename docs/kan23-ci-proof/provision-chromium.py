"""PROPOSAL: one runner-local official download; no sudo, package installs, retries or laptop changes."""
import hashlib, json, os, pathlib, shutil, stat, subprocess, sys, urllib.parse, urllib.request, zipfile
tools=pathlib.Path(sys.argv[1]).resolve(); target=tools/'browsers/chromium-1228'
assert not target.exists(),'Fresh browser directory required'
metadata=json.loads((tools/'node_modules/playwright-core/browsers.json').read_text())
pin=next(x for x in metadata['browsers'] if x['name']=='chromium')
assert pin['revision']=='1228' and pin['browserVersion']=='149.0.7827.55'
assert shutil.disk_usage(tools).free>=3*1024**3,'Need 3GiB disk headroom'
url='https://cdn.playwright.dev/builds/cft/149.0.7827.55/linux64/chrome-linux64.zip'
class Redirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        p=urllib.parse.urlsplit(newurl)
        assert p.scheme=='https' and p.hostname in {'cdn.playwright.dev','playwright.download.prss.microsoft.com','storage.googleapis.com'} and not p.username and not p.password
        return super().redirect_request(req,fp,code,msg,headers,newurl)
archive=tools.parent/'full-chromium.zip'; digest=hashlib.sha256(); size=0
with urllib.request.build_opener(Redirect()).open(url,timeout=30) as source, archive.open('xb') as output:
    while True:
        block=source.read(1024*1024)
        if not block: break
        size+=len(block);assert size<=400*1024*1024,'400MiB download cap'
        digest.update(block);output.write(block)
with zipfile.ZipFile(archive) as z:
    files=z.infolist();assert len(files)<=20000 and sum(x.file_size for x in files)<=2*1024**3
    assert len({x.filename for x in files})==len(files)
    for f in files:
        name=f.filename.rstrip('/');p=pathlib.PurePosixPath(name)
        assert name and '\\' not in name and not p.is_absolute() and '..' not in p.parts and p.as_posix()==name and p.parts[0]=='chrome-linux64'
        kind=stat.S_IFMT(f.external_attr>>16)
        assert kind in ((0,stat.S_IFDIR) if f.is_dir() else (0,stat.S_IFREG)),'No symlinks/special entries'
    target.mkdir()
    for f in files:
        out=target/f.filename
        if f.is_dir(): out.mkdir(parents=True,exist_ok=True);continue
        out.parent.mkdir(parents=True,exist_ok=True)
        with z.open(f) as source,out.open('xb') as output: shutil.copyfileobj(source,output)
        os.chmod(out,0o755 if f.filename.rsplit('/',1)[-1] in {'chrome','chrome_crashpad_handler','chrome-wrapper'} else 0o644)
exe=target/'chrome-linux64/chrome'
version=subprocess.check_output([str(exe),'--version'],timeout=10,text=True).strip()
assert '149.0.7827.55' in version
receipt={'url':url,'archiveBytes':size,'archiveSha256':digest.hexdigest(),'binarySha256':hashlib.sha256(exe.read_bytes()).hexdigest(),'version':version,'revision':'1228','limitation':'Official TLS/version-bound download; no independently preknown upstream archive or binary checksum. Runtime hashes are observations, not prior provenance proof.'}
(tools.parent/'full-chromium-receipt.json').write_text(json.dumps(receipt,indent=2))
