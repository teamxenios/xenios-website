#!/usr/bin/env python3
"""UNAPPLIED source proposal. No browser, credentials, staging or SQL inputs."""
import hashlib, json, os, pathlib, re, selectors, shutil, signal, stat, subprocess, sys, time, zipfile

INNER_SHA = '20658921aa06f6d7ff04d7e2ae3e21450bdbda5bb23f95a16c1c75f8465b18b7'
OUTER_SHA = '73e53b02184fa27a2a863869c6daf17e38a1c452b6d5eefbbbb246fd4c109874'
INVENTORY_SHA = '7d7a507d0f2280e5efbca9c40f76b733b8c5a5bf8ba32c7b799e28bc1e52be54'
VERDICT_SHA = '56d05ca8a8e58ae27a32c264327fe02dae2b930a811b803d222ed5df90929a89'
SOURCE_SHA = 'ebc37ce92ee6f5b11217cee4d150a1dc004bf667'
PROPOSAL = ('docs/health-launch/ql-build-20261012/doc104-baseline-reconciliation-20261013/'
            'mixed-catalog-request-intent-source-proposal/hosted-browser-evidence-contract-r1-20261016/executable-r1')
MODULES = {
    'contracts.mjs': '0d94f699e552539111c2e5ede6973836223b4245e524555ca1cfacacf48d19f4',
    'verify-tools.UNAPPLIED.mjs': '85ee08555304cf4076b8ffe518380e0dd3aba4d42a1836abd8d4685eb8d7c929',
    'hosted-browser.UNAPPLIED.mjs': '1f84221e7a5e665bd5ecfa9f987febd2b8536e442e889d179c33d19c4b374a02',
}
OUTER_FILES = {
    'tool-payload.zip': (112171775, INNER_SHA),
    'tool-payload.sha256': (83, '59a032ea63ec8da2906feef9efc65f72e5db5d667841b82e7f8489b17973c32c'),
    'toolchain-pins.UNACCEPTED.json': (639, 'b4811285fec55876b527614c0539f7fa4a187da51a639d6d15aca65d3dbfb5e7'),
    'preparation-receipt.json': (1160, '381cf38b10146d9d77d3d92df3a95b98a15778a266c1979d57048ea652ab1261'),
}
START = time.monotonic()
report = {'status': 'NOT_COMPLETED', 'artifactId': '12033375179', 'sourceSha': SOURCE_SHA,
          'acceptanceRecordSha256': VERDICT_SHA, 'checks': [], 'processes': [],
          'browserInvoked': False, 'independentProcessClosureProved': False,
          'networkConfinementProved': False, 'nativePayloadInvoked': False}
evidence = None

def need(ok, code):
    if not ok:
        raise RuntimeError(code)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def filehash(p):
    with p.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def fresh_time():
    need(time.monotonic() - START < 600, 'COMPATIBILITY_DEADLINE')

def unique(pairs):
    result = {}
    for key, value in pairs:
        need(key not in result, 'DUPLICATE_JSON_KEY')
        result[key] = value
    return result

def readjson(p):
    return json.loads(p.read_bytes(), object_pairs_hook=unique)

def relative(name):
    need(isinstance(name, str) and 0 < len(name) <= 1024 and '\\' not in name
         and all(ord(c) >= 32 for c in name), 'ARCHIVE_NAME')
    p = pathlib.PurePosixPath(name)
    need(not p.is_absolute() and '..' not in p.parts and p.as_posix() == name
         and name != '.', 'ARCHIVE_PATH')
    return p

def extract(archive_path, root, allow):
    # Same Doc214 principle: outer mode bits are NOT execute authority.
    with zipfile.ZipFile(archive_path) as archive:
        entries = archive.infolist()
        need(0 < len(entries) <= 100000 and sum(x.file_size for x in entries) <= 2147483648,
             'ARCHIVE_CAP')
        names = set()
        for entry in entries:
            fresh_time()
            p = relative(entry.filename)
            need(not entry.is_dir() and entry.filename not in names, 'DUPLICATE_OR_DIRECTORY')
            names.add(entry.filename)
            need(stat.S_IFMT(entry.external_attr >> 16) in (0, stat.S_IFREG), 'ARCHIVE_SPECIAL')
            need(not entry.flag_bits & 1 and allow(p.as_posix()), 'ARCHIVE_MEMBER')
        for entry in entries:
            fresh_time()
            target = root.joinpath(*relative(entry.filename).parts)
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with archive.open(entry) as source, target.open('xb') as dest:
                shutil.copyfileobj(source, dest, 1048576)
            os.chmod(target, 0o600)
        return names

def verify_inventory(root, inventory, restore=False):
    expected = {}
    for item in inventory:
        fresh_time()
        need(isinstance(item, dict) and set(item) == {'path', 'bytes', 'mode', 'sha256'}, 'INVENTORY_SCHEMA')
        p = relative(item['path'])
        need(item['path'] not in expected and type(item['mode']) is int
             and item['mode'] in (0o644, 0o755) and type(item['bytes']) is int
             and 0 <= item['bytes'] <= 2147483648
             and re.fullmatch('[a-f0-9]{64}', item['sha256']), 'INVENTORY_FIELDS')
        target = root.joinpath(*p.parts)
        info = target.lstat()
        need(stat.S_ISREG(info.st_mode) and not target.is_symlink()
             and info.st_size == item['bytes'] and filehash(target) == item['sha256'], 'TOOL_BYTES')
        if not restore:
            need(stat.S_IMODE(info.st_mode) == item['mode'], 'TOOL_MODE')
        expected[item['path']] = (target, item['mode'])
    actual = set()
    for p in root.rglob('*'):
        need(not p.is_symlink(), 'TOOL_SYMLINK')
        if p.is_dir():
            continue
        need(p.is_file(), 'TOOL_SPECIAL')
        actual.add(p.relative_to(root).as_posix())
    need(actual == set(expected), 'EXACT_TOOL_SET')
    if restore:
        for target, mode in expected.values():
            os.chmod(target, mode)

def proc_identity(pid):
    try:
        raw = pathlib.Path('/proc', str(pid), 'stat').read_text()
        fields = raw[raw.rfind(')') + 2:].split()
        return {'pid': pid, 'startTicks': fields[19], 'group': int(fields[2])}
    except FileNotFoundError:
        return None

def command(label, argv, max_seconds=60):
    fresh_time()
    out = evidence / (label + '.stdout.txt')
    err = evidence / (label + '.stderr.txt')
    with out.open('xb') as stdout, err.open('xb') as stderr:
        child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 start_new_session=True, close_fds=True)
        identity = proc_identity(child.pid)
        record = {'label': label, 'identity': identity, 'exit': None,
                  'absenceObservations': [], 'forcedGroupStop': False,
                  'captureComplete': False, 'streams': {}}
        report['processes'].append(record)
        until = min(START + 600, time.monotonic() + max_seconds)
        poller = selectors.DefaultSelector()
        try:
            for name, pipe, retained in [('stdout', child.stdout, stdout), ('stderr', child.stderr, stderr)]:
                os.set_blocking(pipe.fileno(), False)
                record['streams'][name] = {'observedBytes': 0, 'retainedBytes': 0, 'overflow': False}
                poller.register(pipe, selectors.EVENT_READ, (name, retained))
            while poller.get_map() or child.poll() is None:
                need(time.monotonic() < until, 'CHILD_DEADLINE')
                for key, _ in poller.select(timeout=0.1):
                    try:
                        chunk = os.read(key.fd, 65536)
                    except BlockingIOError:
                        continue
                    if not chunk:
                        poller.unregister(key.fileobj)
                        continue
                    name, retained = key.data
                    counts = record['streams'][name]
                    counts['observedBytes'] += len(chunk)
                    remaining = 1048576 - counts['retainedBytes']
                    prefix = chunk[:remaining]
                    retained.write(prefix)
                    counts['retainedBytes'] += len(prefix)
                    if len(chunk) > remaining:
                        counts['overflow'] = True
                        raise RuntimeError('CHILD_OUTPUT_CAP')
            record['captureComplete'] = True
        except BaseException:
            current = proc_identity(child.pid)
            if identity and current == identity:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                    record['forcedGroupStop'] = True
                except ProcessLookupError:
                    record['groupGoneBeforeStop'] = True
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                record['waitIncomplete'] = True
            raise
        finally:
            poller.close()
            child.stdout.close()
            child.stderr.close()
            record['exit'] = child.poll()
            stdout.flush()
            stderr.flush()
            record['stdoutSha256'] = filehash(out)
            record['stderrSha256'] = filehash(err)
    need(out.stat().st_size <= 1048576 and err.stat().st_size <= 1048576, 'CHILD_OUTPUT_CAP')
    for _ in range(2):
        current = proc_identity(child.pid)
        record['absenceObservations'].append(current is None or current != identity)
        time.sleep(0.2)
    need(all(record['absenceObservations']), 'CHILD_IDENTITY_REMAINS')
    need(child.returncode == 0, 'CHILD_FAILED')
    text = out.read_text('utf-8')
    report['checks'].append({'label': label, 'exit': child.returncode,
                             'stdoutSha256': filehash(out), 'stderrSha256': filehash(err)})
    return text.strip()

def main():
    global evidence
    need(sys.platform == 'linux' and len(sys.argv) == 4, 'EXACT_LINUX_INPUTS')
    need(sys.version_info >= (3, 11), 'PYTHON_VERSION')
    report['pythonVersion'] = sys.version
    root = pathlib.Path(os.environ['RUNNER_TEMP']).resolve() / 'kan31-compatibility-r1'
    need(not root.exists(), 'FRESH_OUTPUT_REQUIRED')
    root.mkdir(mode=0o700)
    evidence = root / 'evidence'
    evidence.mkdir(mode=0o700)
    mem = dict(x.split(':', 1) for x in pathlib.Path('/proc/meminfo').read_text().splitlines())
    available = int(mem['MemAvailable'].split()[0]) / 1024
    report['availableMiB'] = available
    need(available >= 4096, 'MEMORY_FLOOR')
    node = pathlib.Path(sys.argv[3]).resolve()
    source = pathlib.Path(sys.argv[2]).resolve()
    modules = source / PROPOSAL
    for name, pin in MODULES.items():
        need(filehash(modules / name) == pin, 'ACCEPTED_MODULE_HASH')
    outer = pathlib.Path(sys.argv[1]).resolve()
    need(outer.stat().st_size == 111736431 and filehash(outer) == OUTER_SHA, 'OUTER_IDENTITY')
    transport = root / 'transport'
    transport.mkdir(mode=0o700)
    need(extract(outer, transport, lambda name: name in OUTER_FILES) == set(OUTER_FILES), 'OUTER_SET')
    for name, (size, pin) in OUTER_FILES.items():
        need((transport / name).stat().st_size == size and filehash(transport / name) == pin, 'INNER_IDENTITY')
    inputs = root / 'inputs'
    inputs.mkdir(mode=0o700)
    extract(transport / 'tool-payload.zip', inputs, lambda name: name == 'tool-inventory.json' or name.startswith('tools/'))
    need(filehash(inputs / 'tool-inventory.json') == INVENTORY_SHA, 'INVENTORY_HASH')
    inventory = readjson(inputs / 'tool-inventory.json')
    need(isinstance(inventory, list) and len(inventory) == 455, 'INVENTORY_COUNT')
    verify_inventory(inputs / 'tools', inventory, restore=True)
    pins = readjson(transport / 'toolchain-pins.UNACCEPTED.json')
    # Separate compatibility-only manifest, NEVER an admitted hosted-run manifest.
    manifest = {'scope': 'COMPATIBILITY_ONLY_NO_HOSTED_RUN', 'toolchain': pins,
                'externalAcceptanceRecordSha256': VERDICT_SHA}
    raw = (json.dumps(manifest, indent=2) + '\n').encode()
    (inputs / 'run-manifest.json').write_bytes(raw)
    os.environ['XENIOS_FROZEN_MANIFEST_SHA256'] = digest(raw)
    need(command('node-version', [str(node), '--version']) == 'v20.19.0', 'NODE_VERSION')
    npm = shutil.which('npm')
    need(npm and command('npm-version', [npm, '--version']) == '10.8.2', 'NPM_VERSION')
    for number, name in enumerate(MODULES):
        command('syntax-' + str(number), [str(node), '--check', str(modules / name)])
    command('inventory-verifier', [str(node), str(modules / 'verify-tools.UNAPPLIED.mjs'), str(inputs)])
    vectors = ("import {pathToFileURL} from 'node:url'; const c=await import(pathToFileURL(process.argv[1]).href);"
               "const g=c.goldenVectors(),o=c.option2RegressionVectors();"
               "if(g.count!==3||g.hashKnownAnswer!==true||o.cases!==20)throw Error('VECTOR_COUNT');"
               "console.log(JSON.stringify({golden:g,option2:o}));")
    command('pure-vectors', [str(node), '--input-type=module', '-e', vectors, str(modules / 'contracts.mjs')])
    entry = inputs / 'tools' / pins['playwrightEntry']
    imports = ("import {pathToFileURL} from 'node:url'; const p=await import(pathToFileURL(process.argv[1]).href);"
               "if(!p.chromium||typeof p.chromium.launch!=='function')throw Error('IMPORT_EXPORT');"
               "console.log(JSON.stringify({imported:true,browserLaunched:false}));")
    command('playwright-import', [str(node), '--input-type=module', '-e', imports, str(entry)])
    readelf, ldconfig = shutil.which('readelf'), shutil.which('ldconfig')
    need(readelf and ldconfig, 'HOST_INSPECTION_TOOL_MISSING')
    binary = inputs / 'tools' / pins['browserPath']
    dynamic = command('elf-needed', [readelf, '-d', str(binary)])
    cache = command('loader-cache', [ldconfig, '-p'])
    needed = re.findall(r'Shared library: \[([^\]]+)\]', dynamic)
    need(needed and all(re.search(r'^\s*' + re.escape(name) + r'\s', cache, re.M) for name in needed), 'DIRECT_LIBRARY_UNRESOLVED')
    report['staticDirectLibraries'] = needed
    report['staticLibrariesAreLaunchProof'] = False
    verify_inventory(inputs / 'tools', inventory)
    for name, pin in MODULES.items():
        need(filehash(modules / name) == pin, 'ACCEPTED_MODULE_CHANGED')
    fresh_time()
    report['status'] = 'COMPATIBILITY_CHECKS_COMPLETED_NOT_BROWSER_QUALIFIED'

try:
    main()
except Exception as error:
    report['status'] = 'FAILED'
    code = str(error) if isinstance(error, RuntimeError) else 'OPERATION_FAILED'
    report['failure'] = code if re.fullmatch('[A-Z_]+', code) else 'OPERATION_FAILED'
finally:
    report['elapsedSeconds'] = time.monotonic() - START
    if evidence:
        (evidence / 'compatibility-receipt.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'independentClosure': False, 'retryAuthorized': False}))
sys.exit(0 if report['status'] == 'COMPATIBILITY_CHECKS_COMPLETED_NOT_BROWSER_QUALIFIED' else 1)
