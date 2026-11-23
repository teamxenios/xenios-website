import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { posix } from 'node:path';

export const PROFILE = 'XENIOS_HOSTED_STATIC_PREVIEW_IMPORT_V1';
const LIMIT = { archive: 128 * 1024 * 1024, total: 256 * 1024 * 1024, file: 32 * 1024 * 1024, entries: 4096 };
export const sha256 = b => createHash('sha256').update(b).digest('hex');
const need = (ok, code) => assert(ok, code);
const hex = (s, n) => typeof s === 'string' && new RegExp('^[a-f0-9]{' + n + '}$').test(s);
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function safeName(s, directory = false) {
  need(typeof s === 'string' && s.length > 0 && s.length <= 240 && /^[\x21-\x7e]+$/.test(s), 'UNSAFE_MEMBER_NAME');
  need(!/[\\:%?#]/.test(s) && !s.startsWith('/'), 'UNSAFE_MEMBER_NAME');
  const value = directory ? s.slice(0, -1) : s;
  need(value.split('/').every(p => p && p !== '.' && p !== '..' && !/[. ]$/.test(p)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)), 'UNSAFE_MEMBER_NAME');
  return s;
}
function extra(buf) {
  for (let p = 0; p < buf.length;) {
    need(p + 4 <= buf.length, 'ZIP_EXTRA_TRUNCATED'); const id = buf.readUInt16LE(p), n = buf.readUInt16LE(p + 2);
    need(id !== 1 && id !== 0x7075 && p + 4 + n <= buf.length, 'ZIP_UNSUPPORTED_EXTRA'); p += 4 + n;
  }
}
// Strict finite ZIP32 reader. Never extracts paths or executes archive contents.
export function readZip32(zip) {
  need(Buffer.isBuffer(zip) && zip.length >= 22 && zip.length <= LIMIT.archive, 'ZIP_ARCHIVE_BOUND');
  let eocd = -1;
  for (let p = zip.length - 22; p >= Math.max(0, zip.length - 65557); p--) if (zip.readUInt32LE(p) === 0x06054b50 && p + 22 + zip.readUInt16LE(p + 20) === zip.length) { eocd = p; break; }
  need(eocd >= 0, 'ZIP_EOCD');
  const count = zip.readUInt16LE(eocd + 10), cdSize = zip.readUInt32LE(eocd + 12), cd = zip.readUInt32LE(eocd + 16);
  need(zip.readUInt16LE(eocd + 4) === 0 && zip.readUInt16LE(eocd + 6) === 0 && zip.readUInt16LE(eocd + 8) === count
    && count > 0 && count <= LIMIT.entries && cd + cdSize === eocd, 'ZIP_DIRECTORY_BOUND');
  const entries = [], names = new Set(); let cursor = cd, total = 0;
  for (let i = 0; i < count; i++) {
    need(cursor + 46 <= eocd && zip.readUInt32LE(cursor) === 0x02014b50, 'ZIP_CENTRAL_HEADER');
    const flags = zip.readUInt16LE(cursor + 8), method = zip.readUInt16LE(cursor + 10), crc = zip.readUInt32LE(cursor + 16);
    const compressed = zip.readUInt32LE(cursor + 20), size = zip.readUInt32LE(cursor + 24);
    const n = zip.readUInt16LE(cursor + 28), x = zip.readUInt16LE(cursor + 30), comment = zip.readUInt16LE(cursor + 32), offset = zip.readUInt32LE(cursor + 42);
    need(cursor + 46 + n + x + comment <= eocd && zip.readUInt16LE(cursor + 34) === 0, 'ZIP_CENTRAL_BOUND');
    need((flags & ~0x808) === 0 && [0, 8].includes(method) && zip.readUInt16LE(cursor + 6) <= 20, 'ZIP_UNSUPPORTED_FORMAT');
    const nameBytes = zip.subarray(cursor + 46, cursor + 46 + n), name = nameBytes.toString('utf8'), directory = name.endsWith('/');
    safeName(name, directory); need(Buffer.from(name).equals(nameBytes) && !names.has(name.toLowerCase()), 'ZIP_DUPLICATE_OR_ENCODING'); names.add(name.toLowerCase());
    extra(zip.subarray(cursor + 46 + n, cursor + 46 + n + x));
    const attributes = zip.readUInt32LE(cursor + 38), type = (attributes >>> 16) & 0xf000;
    need([0, 0x8000, 0x4000].includes(type) && !(attributes & 0x400) && (type !== 0x4000 || directory)
      && (!(attributes & 0x10) || directory), 'ZIP_NON_REGULAR_MEMBER');
    need(size <= LIMIT.file && compressed <= LIMIT.archive && (compressed > 0 || size === 0)
      && (compressed === 0 || size <= compressed * 1000) && (!directory || size === 0), 'ZIP_MEMBER_SIZE');
    total += size; need(total <= LIMIT.total, 'ZIP_TOTAL_SIZE');
    need(offset + 30 <= cd && zip.readUInt32LE(offset) === 0x04034b50, 'ZIP_LOCAL_HEADER');
    const ln = zip.readUInt16LE(offset + 26), lx = zip.readUInt16LE(offset + 28), start = offset + 30 + ln + lx;
    need(start <= cd && zip.readUInt16LE(offset + 6) === flags && zip.readUInt16LE(offset + 8) === method
      && zip.subarray(offset + 30, offset + 30 + ln).equals(nameBytes), 'ZIP_LOCAL_CENTRAL_MISMATCH');
    extra(zip.subarray(offset + 30 + ln, start));
    let end = start + compressed; need(end <= cd, 'ZIP_COMPRESSED_BOUND');
    if (flags & 8) {
      const signed = end + 4 <= cd && zip.readUInt32LE(end) === 0x08074b50; const d = end + (signed ? 4 : 0);
      need(d + 12 <= cd && zip.readUInt32LE(d) === crc && zip.readUInt32LE(d + 4) === compressed && zip.readUInt32LE(d + 8) === size, 'ZIP_DESCRIPTOR'); end = d + 12;
    } else need(zip.readUInt32LE(offset + 14) === crc && zip.readUInt32LE(offset + 18) === compressed && zip.readUInt32LE(offset + 22) === size, 'ZIP_LOCAL_SIZE');
    const payload = zip.subarray(start, start + compressed);
    const bytes = method === 0 ? Buffer.from(payload) : inflateRawSync(payload, { maxOutputLength: Math.max(1, size) });
    need(bytes.length === size && crc32(bytes) === crc, 'ZIP_CONTENT_CRC_OR_SIZE');
    entries.push({ name, directory, offset, end, bytes }); cursor += 46 + n + x + comment;
  }
  need(cursor === eocd, 'ZIP_DIRECTORY_TRAILING');
  const intervals = [...entries].sort((a, b) => a.offset - b.offset); let end = 0;
  for (const entry of intervals) { need(entry.offset === end, 'ZIP_OVERLAP_OR_GAP'); end = entry.end; }
  need(end === cd, 'ZIP_LOCAL_TRAILING');
  return entries;
}
export function validateBinding(b) {
  need(b?.kind === 'ROOT_SELECTED_HOSTED_PREVIEW_BINDING_V1' && b.profile === PROFILE, 'BINDING_PROFILE');
  for (const key of ['source', 'tree', 'base', 'runner', 'runnerTree']) need(hex(b[key], 40), 'BINDING_GIT');
  need(b.runnerTree === b.tree, 'RUNNER_TREE_DIFFERS');
  need(Array.isArray(b.runnerParents) && (b.runner === b.source
    ? b.runnerParents.every(p => hex(p, 40))
    : b.runnerParents.length === 2 && b.runnerParents[0] === b.base && b.runnerParents[1] === b.source), 'RUNNER_PARENT_RELATION');
  for (const key of ['runId', 'attempt', 'jobId', 'artifactId', 'archiveBytes']) need(Number.isSafeInteger(b[key]) && b[key] > 0, 'BINDING_NUMBER');
  need(b.archiveBytes <= LIMIT.archive && ['success', 'in_progress'].includes(b.jobConclusion) && b.jobName === 'build' && b.artifactExpired === false, 'BINDING_JOB');
  need(b.artifactName === 'homepage-preview-' + b.source && hex(b.archiveSha256, 64) && hex(b.rootSelectionSha256, 64), 'BINDING_ARTIFACT');
  need(['', 'public/', 'dist/public/'].includes(b.archiveRoot) && b.node === 'v20.19.0' && typeof b.custodian === 'string' && b.custodian.length > 0, 'BINDING_SCOPE');
  for (const key of ['runEvidenceSha256', 'jobEvidenceSha256', 'artifactEvidenceSha256', 'runnerSelectionEvidenceSha256']) need(hex(b[key], 64), 'BINDING_EVIDENCE_PIN');
  return b;
}
function allowedFile(p) {
  return p === 'index.html' || p === 'PREVIEW-SOURCE.json' || /^assets\/[A-Za-z0-9_./-]+$/.test(p)
    || /^brand\/xenios-mark(?:-transparent)?\.png$/.test(p) || /^favicon[^/]*\.png$/.test(p)
    || ['favicon.ico', 'apple-touch-icon.png', 'site.webmanifest'].includes(p)
    || /^android-chrome[^/]*\.png$/.test(p) || /^og\/xenios-(?:home-full-vision-v3|early-access-v1)\.png$/.test(p);
}
function reference(from, value, files, edges) {
  if (/^(data:|blob:|#)/.test(value)) return;
  need(!/[\\%\0]/.test(value), 'DEPENDENCY_ENCODING:' + from + ':' + value.slice(0, 120));
  need(!/^(?:[a-z]+:|\/\/)/i.test(value), 'EXTERNAL_STATIC_DEPENDENCY');
  const raw = value.split(/[?#]/)[0]; if (!raw) return;
  const p = raw.startsWith('/') ? raw.slice(1) : posix.normalize(posix.join(posix.dirname(from), raw));
  need(!p.startsWith('../') && files.has(p), 'MISSING_ASSET_DEPENDENCY:' + from + ':' + p); edges.push({ from, to: p });
}
export function validateDependencies(files, parseJavaScript, parseCssReferences, optionalBareImports = []) {
  need(typeof parseJavaScript === 'function' && Array.isArray(optionalBareImports), 'JS_PARSER_REQUIRED'); const edges = [], optionalObserved = [];
  for (const [name, bytes] of files) {
    if (name === 'index.html') {
      const html = bytes.toString('utf8'); need(!/<base\b/i.test(html) && !/<script\b[^>]*\btype\s*=\s*["']importmap["']/i.test(html), 'HTML_BASE_OR_IMPORTMAP_UNSUPPORTED');
      for (const m of html.matchAll(/<(script|link|img|source)\b[^>]*>/gi)) {
        if (m[1].toLowerCase() === 'link' && !/\brel\s*=\s*["'](?:stylesheet|modulepreload|icon|manifest|apple-touch-icon)["']/i.test(m[0])) continue;
        for (const a of m[0].matchAll(/\b(src|href)\s*=\s*(["'])(.*?)\2/gi)) reference(name, a[3], files, edges);
        need(!/\bsrcset\s*=/i.test(m[0]), 'HTML_SRCSET_UNSUPPORTED');
      }
    } else if (name.endsWith('.css')) {
      need(typeof parseCssReferences === 'function', 'CSS_PARSER_REQUIRED');
      for (const value of parseCssReferences(bytes.toString('utf8'))) reference(name, value, files, edges);
    } else if (name.endsWith('.js')) {
      const ast = parseJavaScript(bytes.toString('utf8'));
      const visit = (node, ancestors = []) => {
        if (!node || typeof node !== 'object') return;
        if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type) && node.source) {
          if (typeof node.source.value !== 'string') {
            const selected = optionalBareImports.filter(p => p.path === name && p.start === node.start);
            need(selected.length === 1, 'NON_LITERAL_IMPORT_UNSUPPORTED:' + name + ':' + bytes.toString('utf8').slice(node.start, node.end).slice(0, 100));
            const p = selected[0], member = ancestors.at(-1), call = ancestors.at(-2);
            need(node.type === 'ImportExpression' && node.source.type === 'Identifier' && p.sha256 === sha256(bytes)
              && p.expression === bytes.toString('utf8').slice(node.start, node.end) && p.module === '@opentelemetry/api', 'OPTIONAL_IMPORT_PIN');
            const globals = (ast.program ?? ast).body.filter(n => n.type === 'VariableDeclaration' && n.kind === 'const')
              .flatMap(n => n.declarations).filter(d => d.id?.type === 'Identifier' && d.id.name === node.source.name && d.init?.value === p.module);
            const hasName = value => value && typeof value === 'object' && ((value.type === 'Identifier' && value.name === node.source.name)
              || Object.values(value).some(v => Array.isArray(v) ? v.some(hasName) : v && typeof v === 'object' && hasName(v)));
            for (const scope of ancestors.filter(a => /Function|Method/.test(a.type))) {
              need(!scope.params?.some(hasName), 'OPTIONAL_IMPORT_SHADOWED');
              const check = n => {
                if (!n || typeof n !== 'object') return;
                if (n.type === 'VariableDeclarator') need(!hasName(n.id), 'OPTIONAL_IMPORT_SHADOWED');
                for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(check); else if (v && typeof v === 'object') check(v);
              }; check(scope.body);
            }
            need(globals.length === 1 && member?.type === 'MemberExpression' && member.object === node
              && !member.computed && member.property?.name === 'catch' && call?.type === 'CallExpression' && call.callee === member
              && call.arguments.length === 1 && call.arguments[0].type === 'ArrowFunctionExpression'
              && call.arguments[0].params.length === 0 && call.arguments[0].body.type === 'NullLiteral', 'OPTIONAL_IMPORT_CATCH_NULL');
            optionalObserved.push({ ...p, disposition: 'OPTIONAL_BARE_IMPORT_NO_IMPORTMAP_CATCH_NULL_RUNTIME_UNRUN' });
          } else reference(name, node.source.value, files, edges);
        }
        if (node.type === 'CallExpression' && node.callee?.type === 'Import') {
          need(node.arguments.length === 1 && typeof node.arguments[0]?.value === 'string', 'NON_LITERAL_IMPORT_UNSUPPORTED'); reference(name, node.arguments[0].value, files, edges);
        }
        // Vite's preload map holds root-relative asset names in ordinary literals.
        if ((node.type === 'StringLiteral' || node.type === 'Literal') && typeof node.value === 'string') {
          if (/^(?:\/?assets\/|\.\.?\/).+\.(?:js|css|woff2?|png|svg|jpe?g|webp|avif|gif|ico|json)(?:[?#].*)?$/.test(node.value)) {
            const value = node.value.startsWith('assets/') ? '/' + node.value : node.value; reference(name, value, files, edges);
          }
        }
        for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(v => visit(v, [...ancestors, node])); else if (value && typeof value === 'object') visit(value, [...ancestors, node]);
      }; visit(ast);
    }
  }
  need(edges.some(e => e.from === 'index.html' && e.to.endsWith('.js')), 'MISSING_ENTRY_JS');
  need(optionalObserved.length === optionalBareImports.length, 'UNUSED_OPTIONAL_IMPORT_ALLOWANCE');
  return { edges, optionalObserved };
}
export function orderedInventory(files) {
  return [...files].map(([path, bytes]) => ({ path: 'public/' + path, bytes: bytes.length, sha256: sha256(bytes) }))
    .sort((a, b) => { const aa = a.path.split('/'), bb = b.path.split('/'); for (let i = 0; i < Math.min(aa.length, bb.length); i++) { if (aa[i] !== bb[i]) return aa[i] < bb[i] ? -1 : 1; } return aa.length - bb.length; });
}
export function inspectHostedPreview(zip, binding, { parseJavaScript, parseCssReferences, artifactSelection, progressRecord } = {}) {
  const b = validateBinding(binding);
  need(Buffer.isBuffer(artifactSelection) && sha256(artifactSelection) === b.artifactEvidenceSha256
    && Buffer.isBuffer(progressRecord) && sha256(progressRecord) === b.runEvidenceSha256 && b.runEvidenceSha256 === b.jobEvidenceSha256, 'RECEIPT_DIGEST');
  const selection = JSON.parse(artifactSelection), progress = JSON.parse(progressRecord);
  const a = selection.artifact, run = progress.liveRun;
  need(selection.repo === 'teamxenios/xenios-website' && selection.run === b.runId && selection.attempt === b.attempt
    && selection.buildJob === b.jobId && a?.id === b.artifactId && a.name === b.artifactName && a.expired === false
    && a.size_in_bytes === b.archiveBytes && a.digest === 'sha256:' + b.archiveSha256
    && a.workflow_run?.id === b.runId && a.workflow_run.head_sha === b.source, 'ARTIFACT_RUN_JOB_JOIN');
  need(run?.id === b.runId && run.attempt === b.attempt && run.head === b.source && run.buildJob === b.jobId
    && progress.currentSource?.tree === b.tree, 'PROGRESS_RUN_JOB_JOIN');
  need(zip.length === b.archiveBytes && sha256(zip) === b.archiveSha256, 'ARCHIVE_DIGEST_OR_SIZE');
  const entries = readZip32(zip), files = new Map();
  for (const entry of entries) {
    need(entry.name.startsWith(b.archiveRoot), 'ARCHIVE_ROOT_MISMATCH'); const name = entry.name.slice(b.archiveRoot.length);
    if (entry.directory) { need(!name || ['assets/', 'brand/', 'og/'].some(p => name === p || name.startsWith(p)), 'UNEXPECTED_DIRECTORY'); continue; }
    safeName(name); need(allowedFile(name), 'UNEXPECTED_ARCHIVE_FILE'); files.set(name, entry.bytes);
  }
  const foldedFiles = new Set([...files.keys()].map(p => p.toLowerCase()));
  for (const name of files.keys()) { const parts = name.toLowerCase().split('/'); for (let i = 1; i < parts.length; i++) need(!foldedFiles.has(parts.slice(0, i).join('/')), 'FILE_DIRECTORY_COLLISION'); }
  need(files.has('index.html') && files.has('PREVIEW-SOURCE.json'), 'REQUIRED_PREVIEW_FILES');
  const marker = JSON.parse(files.get('PREVIEW-SOURCE.json').toString('utf8'));
  for (const [mk, bk] of [['sourceHead', 'source'], ['sourceTree', 'tree'], ['baseHead', 'base'], ['executedCommit', 'runner'], ['executedTree', 'runnerTree'], ['node', 'node']]) need(marker[mk] === b[bk], 'PREVIEW_MARKER_IDENTITY:' + mk);
  need(JSON.stringify(marker.executedParents) === JSON.stringify(b.runnerParents)
    && marker.scope === 'Private provider-inert public static preview. No application server or managed action.', 'PREVIEW_MARKER_SCOPE');
  const { edges, optionalObserved } = validateDependencies(files, parseJavaScript, parseCssReferences, b.optionalBareImports), fileInventory = orderedInventory(files);
  const provenance = { schemaVersion: 1, kind: PROFILE, candidateSha: b.source, sourceTree: b.tree,
    sourceRole: 'HOSTED_STATIC_SUBSET_IMPORTED_WITHOUT_BUILD', binding: b, bindingSha256: sha256(Buffer.from(JSON.stringify(b))),
    markerSha256: sha256(files.get('PREVIEW-SOURCE.json')), fileInventory, distFileCount: fileInventory.length,
    distInventorySha256: sha256(Buffer.from(JSON.stringify(fileInventory))), dependencyEdges: edges, optionalBareImports: optionalObserved,
    claims: { freshBuild: false, npmCi: false, completeDistribution: false, liveAuthentication: false,
      actualCatalog: false, publication: false, browserExecuted: false, releaseAuthorized: false } };
  return { files, provenance };
}
