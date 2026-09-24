// Isolated browser qualification harness. Never imported by application code.
// Runs a supplied exact production bundle; all provider responses are synthetic.
const path = require('node:path');
const net = require('node:net');
const bundle = path.resolve(process.argv[2] || '');
if (!bundle.endsWith(path.join('dist', 'index.cjs'))) throw Error('Explicit built bundle required');
const keep = new Set(['PATH','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','HOMEDRIVE','HOMEPATH','LOCALAPPDATA','APPDATA','PATHEXT','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS']);
for (const key of Object.keys(process.env)) if (!keep.has(key.toUpperCase())) delete process.env[key];
Object.assign(process.env, { NODE_ENV: 'production', PORT: '5303', RESEND_API_KEY: 're_synthetic_local_only', FROM_EMAIL: 'xenios <team@xeniostechnology.com>', RESEARCH_PUBLIC: 'true', RESEARCH_SESSION_SECRET: 'contact-preview-not-production', SUPABASE_URL: 'http://127.0.0.1:5303/blocked-backend', SUPABASE_ANON_KEY: 'synthetic-only', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only' });
let accepted = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== 'https://api.resend.com' || url.pathname !== '/emails') throw Error('Contact preview blocked outbound fetch');
  const body = JSON.parse(String(init?.body || '{}'));
  const recipients = Array.isArray(body.to) ? body.to : [body.to];
  if (recipients.some(value => value === 'courtesy-fail@example.invalid')) {
    console.log('[synthetic-email-capture] courtesy rejected; no network request');
    return new Response(JSON.stringify({ name: 'validation_error', message: 'synthetic courtesy rejection' }), { status: 422, headers: { 'content-type':'application/json' } });
  }
  if (!recipients.every(value => value === 'team@xeniostechnology.com' || value === 'audit@example.invalid')) throw Error('Unknown fixture recipient');
  accepted++;
  console.log('[synthetic-email-capture] acceptance '+accepted+'; no network request');
  return new Response(JSON.stringify({ id: 'synthetic-acceptance-'+accepted }), { status: 200, headers: { 'content-type':'application/json' } });
};
net.Socket.prototype.connect = function () { throw Error('Contact preview blocked outbound socket'); };
console.log('[contact-preview] SYNTHETIC EMAIL RESPONSES ONLY; outbound sockets blocked; localhost:5303');
require(bundle);
