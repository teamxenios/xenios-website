// Build-time SOURCE transformation of a verified, physically owned SDK copy.
// Never imported by the application and never mutates a live instance/global.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const PINS = Object.freeze({
  '@supabase/auth-js/src/GoTrueClient.ts': '5fa1b69040657aefe2fd94697f3a290cbfa1bb21d3406f87bfb056f972f517b6',
  '@supabase/supabase-js/src/SupabaseClient.ts': '83702688e4b6b8d9cd90a32fb1cb126fd80491ddca5ece5b2d31e67d1a89e926',
  '@supabase/realtime-js/src/RealtimeClient.ts': '983d229aa7f269f5572020f714b50a872c831ee562f8ce56436ca9ed0218bd6b',
});
const digest = text => createHash('sha256').update(text).digest('hex');
function pinned(file, pin) {
  const raw = fs.readFileSync(file);
  if (digest(raw) !== pin) throw new Error('SDK_SOURCE_PIN_MISMATCH');
  return raw.toString('utf8').replace(/\r\n/g, '\n');
}
function replaceOne(text, before, after) {
  if (text.split(before).length !== 2) throw new Error('SDK_SOURCE_ANCHOR_MISMATCH');
  return text.replace(before, after);
}
function edits(text, items) {
  let boundary = text.length + 1;
  for (const item of items.sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (item.end > boundary) throw new Error('SDK_SOURCE_EDIT_OVERLAP');
    text = text.slice(0, item.start) + item.text + text.slice(item.end);
    boundary = item.start;
  }
  return text;
}

// Every mutation-root which is NOT supported in this prototype is refused
// before provider work. This is a bounded prototype, not total SDK adoption.
const UNSUPPORTED = new Set(['signInAnonymously', 'signUp', 'signInWithOAuth',
  'exchangeCodeForSession', '_exchangeCodeForSession', 'signInWithWeb3', 'signInWithEthereum', 'signInWithSolana',
  'signInWithIdToken', 'signInWithOtp', 'verifyOtp', 'signInWithSSO', 'resend',
  'linkIdentity', 'linkIdentityOAuth', 'linkIdentityIdToken', 'unlinkIdentity',
  '_enroll', '_unenroll', 'signInWithPasskey', 'registerPasskey',
  '_startPasskeyRegistration', '_verifyPasskeyRegistration', '_startPasskeyAuthentication',
  '_verifyPasskeyAuthentication', '_getAuthorizationDetails', '_approveAuthorization',
  '_denyAuthorization', '_listOAuthGrants', '_revokeOAuthGrant']);
const ROOTS = new Set(['_initialize', 'signInWithPassword', 'getSession', 'getUser',
  'updateUser', 'setSession', 'refreshSession', 'signOut', '_verify', '_challenge',
  '_challengeAndVerify', '_listFactors', '_getAuthenticatorAssuranceLevel',
  '_recoverAndRefresh', '_emitInitialSession', '_autoRefreshTokenTick', 'resetPasswordForEmail']);
const ARITY = new Map([
  ['_initialize', 0], ['signInWithPassword', 1], ['getSession', 0], ['getUser', 1], ['_getUser', 1],
  ['updateUser', 2], ['_updateUser', 2], ['setSession', 1], ['_setSession', 1],
  ['refreshSession', 1], ['_refreshSession', 1], ['signOut', 1], ['_signOut', 1],
  ['_verify', 1], ['_challenge', 1], ['_challengeAndVerify', 1], ['_listFactors', 0],
  ['_getAuthenticatorAssuranceLevel', 1], ['_recoverAndRefresh', 0], ['_emitInitialSession', 1],
  ['_autoRefreshTokenTick', 0], ['resetPasswordForEmail', 2], ['_useSession', 1],
  ['__loadSession', 0], ['_saveSession', 1], ['_removeSession', 0],
  ['_notifyAllSubscribers', 3], ['_callRefreshToken', 1], ['_getSessionFromURL', 2],
]);

const PUBLIC_API = `
  private _sessionProtocol?: SessionProtocol
  configureSessionCoordination(options: ProtocolOptions) {
    if (this.initializePromise || this.lock || this.userStorage || !this.persistSession || this.flowType !== 'implicit')
      throw new ProtocolError('session_protocol_unsupported')
    this._sessionProtocol = new SessionProtocol(this.storage, this.storageKey, options)
    if (typeof window !== 'undefined' && /(?:^|&)type=recovery(?:&|$)/.test(window.location.hash.replace(/^#/, '')))
      this._sessionProtocol.recoveryDenied = true
    return this._sessionProtocol.capability
  }
  getSessionProtocolCapability() { return this._sessionProtocol?.capability ?? { available: false } }
  consumeSessionResult(result: any, effect: (value: any) => void) {
    if (!this._sessionProtocol) throw new ProtocolError('session_protocol_unsupported')
    return this._sessionProtocol.consumeResult(result, effect)
  }
  consumeSessionTicket(ticket: ProtocolTicket, effect: () => void, allowPurposeDenied = false) {
    if (!this._sessionProtocol) throw new ProtocolError('session_protocol_unsupported')
    return this._sessionProtocol.consume(ticket, effect, allowPurposeDenied)
  }
  consumeRealtimeToken(ticket: ProtocolTicket, token: string | null, anonymousKey: string, effect: () => void, allowPurposeDenied = false) {
    if (!this._sessionProtocol) throw new ProtocolError('session_protocol_unsupported')
    return this._sessionProtocol.consumeToken(ticket, token, anonymousKey, effect, allowPurposeDenied)
  }
  async captureSessionTicket() {
    if (!this._sessionProtocol) throw new ProtocolError('session_protocol_unsupported')
    await this._sessionProtocol.initialized()
    return (await this._sessionProtocol.begin('effect-capture')).ticket
  }
  requestRecoveryCleanup(expectedToken: string) {
    const protocol = this._sessionProtocol
    if (!protocol) throw new ProtocolError('session_protocol_unsupported')
    protocol.recoveryDenied = true
    return protocol.conditionalRecoveryClear(expectedToken).then(async op => {
      await this._notifyAllSubscribers('SIGNED_OUT', null, true, op)
      return { data: null, error: null, sessionProtocol: op.ticket }
    }).catch(error => ({ data: null, error }))
  }
`;
const SPECIAL = {
  _saveSession: `if (this._sessionProtocol) { await this._sessionProtocol.commit(__sessionOperation!, session); return }`,
  _removeSession: `if (this._sessionProtocol) {
    await this._sessionProtocol.commit(__sessionOperation!, null)
    await this._notifyAllSubscribers('SIGNED_OUT', null, true, __sessionOperation)
    return
  }`,
  _notifyAllSubscribers: `if (this._sessionProtocol) {
    const protocol = this._sessionProtocol
    if ((protocol.recoveryDenied || __sessionOperation?.purpose === 'recovery') && ['SIGNED_IN', 'TOKEN_REFRESHED', 'MFA_CHALLENGE_VERIFIED'].includes(event)) return
    await protocol.notify(__sessionOperation!, ticket => {
      if (this.broadcastChannel && broadcast) this.broadcastChannel.postMessage({ event, session, sessionProtocol: ticket })
      for (const listener of this.stateChangeEmitters.values()) protocol.observe(listener.callback, event, session, ticket)
    })
    return
  }`,
  _callRefreshToken: `if (this._sessionProtocol) {
    const { data, error } = await this._refreshAccessToken(refreshToken)
    if (error) {
      const current = await this._sessionProtocol.read(__sessionOperation!)
      if (current?.expires_at && current.expires_at * 1000 <= Date.now()) await this._removeSession(__sessionOperation)
      return { data: null, error }
    }
    if (!data.session) throw new ProtocolError()
    await this._saveSession(data.session, __sessionOperation)
    await this._notifyAllSubscribers('TOKEN_REFRESHED', data.session, true, __sessionOperation)
    return { data: data.session, error: null }
  }`,
  _recoverAndRefresh: `if (this._sessionProtocol) {
    const current = await this._sessionProtocol.read(__sessionOperation!)
    if (!current) return
    if (!this._isValidSession(current)) { await this._removeSession(__sessionOperation); return }
    if ((current.expires_at ?? Infinity) * 1000 - Date.now() < EXPIRY_MARGIN_MS && this.autoRefreshToken) {
      await this._callRefreshToken(current.refresh_token, __sessionOperation); return
    }
    if (!current.user) {
      const checked = await this._getUser(current.access_token, __sessionOperation)
      if (checked.error || !checked.data.user) return
      current.user = checked.data.user
      await this._saveSession(current, __sessionOperation)
    }
    await this._notifyAllSubscribers('SIGNED_IN', current, true, __sessionOperation)
    return
  }`,
  _emitInitialSession: `if (this._sessionProtocol) {
    const protocol = this._sessionProtocol
    const session = protocol.recoveryDenied || __sessionOperation?.purpose === 'recovery' ? null : await protocol.read(__sessionOperation!)
    await protocol.notify(__sessionOperation!, ticket => {
      const listener = this.stateChangeEmitters.get(id)
      if (listener) protocol.observe(listener.callback, 'INITIAL_SESSION', session, ticket)
    })
    return
  }`,
};

export function patchAuthSource(text, ts) {
  const tree = ts.createSourceFile('GoTrueClient.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const changes = [];
  const sdkClass = tree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'GoTrueClient');
  if (!sdkClass) throw new Error('SDK_CLASS_MISSING');
  changes.push({ start: 0, end: 0, text: "import { SessionProtocol, ProtocolError, type ProtocolOperation, type ProtocolOptions, type ProtocolTicket } from './lib/SessionProtocol'\n" });
  changes.push({ start: sdkClass.members.pos, end: sdkClass.members.pos, text: PUBLIC_API });
  const declared = new Set();
  const mutationOwners = new Set();
  for (const method of sdkClass.members) {
    if (!ts.isMethodDeclaration(method)) continue;
    const name = method.name.getText(tree);
    if (ARITY.has(name)) {
      declared.add(name);
      const end = method.parameters.end;
      const comma = method.parameters.length && text.slice(0, end).trimEnd().endsWith(',') ? '' : method.parameters.length ? ',' : '';
      changes.push({ start: end, end, text: `${comma} __sessionOperation?: ProtocolOperation` });
    }
    if (!method.body) continue;
    const open = method.body.getStart(tree) + 1;
    let prefix = '';
    if (UNSUPPORTED.has(name)) prefix += "\nif (this._sessionProtocol) throw new ProtocolError('session_protocol_surface_unsupported')\n";
    if (ROOTS.has(name)) {
      const args = method.parameters.map(parameter => parameter.name.getText(tree));
      if (args.some(arg => !/^[A-Za-z_]\w*$/.test(arg))) throw new Error('SDK_ROOT_PARAMETER_UNSUPPORTED');
      prefix += `\nif (this._sessionProtocol && !__sessionOperation) return this._sessionProtocol.run(${JSON.stringify(name)}, op => this.${name}(${[...args, 'op'].join(', ')}))\nif (this._sessionProtocol) this._sessionProtocol.validate(__sessionOperation!)\n`;
    }
    if (SPECIAL[name]) prefix += '\n' + SPECIAL[name] + '\n';
    if (prefix) changes.push({ start: open, end: open, text: prefix });
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
        const called = node.expression.name.text;
        if (['_saveSession', '_removeSession', '_notifyAllSubscribers'].includes(called)) mutationOwners.add(name);
        if (ARITY.has(name) && ARITY.has(called)) {
          const count = node.arguments.length, arity = ARITY.get(called);
          if (count > arity) throw new Error('SDK_CALL_ARITY_CHANGED');
          const missing = Array(arity - count).fill('undefined');
          const insert = [...missing, '__sessionOperation'].join(', ');
          const comma = count && text.slice(0, node.arguments.end).trimEnd().endsWith(',') ? '' : count ? ', ' : '';
          changes.push({ start: node.arguments.end, end: node.arguments.end, text: comma + insert });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(method.body);
  }
  for (const name of ARITY.keys()) if (!declared.has(name)) throw new Error('SDK_METHOD_CENSUS_CHANGED:' + name);
  for (const owner of mutationOwners) if (!ARITY.has(owner) && !UNSUPPORTED.has(owner)) throw new Error('SDK_MUTATION_CENSUS_CHANGED:' + owner);
  let result = edits(text, changes);
  result = replaceOne(result, '    return await this.initializePromise\n  }\n\n  /**\n   * IMPORTANT:',
    '    this._sessionProtocol?.bindInitialization(this.initializePromise)\n    return await this.initializePromise\n  }\n\n  /**\n   * IMPORTANT:');
  result = replaceOne(result, '      const maybeSession = await getItemAsync(this.storage, this.storageKey)',
    '      const maybeSession = this._sessionProtocol ? await this._sessionProtocol.read(__sessionOperation!) : await getItemAsync(this.storage, this.storageKey)');
  result = replaceOne(result, '          await this._notifyAllSubscribers(event.data.event, event.data.session, false) // broadcast = false so we don\'t get an endless loop of messages',
    '          if (this._sessionProtocol) { await this._sessionProtocol.receive(event.data, (kind, value, op) => this._notifyAllSubscribers(kind, value, false, op)); return }\n          await this._notifyAllSubscribers(event.data.event, event.data.session, false) // broadcast = false so we don\'t get an endless loop of messages');
  // Explicit JWT lookups must not delete a newer/current unrelated session.
  result = replaceOne(result, '        if (isAuthSessionMissingError(error)) {\n          // JWT contains',
    '        if (isAuthSessionMissingError(error) && (!this._sessionProtocol || !jwt || jwt === __sessionOperation?.source?.access_token)) {\n          // JWT contains');
  // Strict implicit-mode prototype has no legacy verifier slot to mutate.
  result = result.replaceAll('await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`)',
    'await (this._sessionProtocol ? Promise.resolve() : removeItemAsync(this.storage, `${this.storageKey}-code-verifier`))');
  return { text: result, census: { declared: [...declared].sort(), mutationOwners: [...mutationOwners].sort(), unsupported: [...UNSUPPORTED].sort() } };
}

export function patchSupabaseSource(text) {
  text = replaceOne(text, '(event, session) => {\n      this._handleTokenChanged(event, \'CLIENT\', session?.access_token)',
    '(event, session, sessionProtocol?: any) => {\n      this._handleTokenChanged(event, \'CLIENT\', session?.access_token, sessionProtocol)');
  text = replaceOne(text, "    token?: string\n  ) {", "    token?: string,\n    sessionProtocol?: any\n  ) {");
  text = replaceOne(text, "    if (\n      (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')",
    "    const auth = this.auth as any\n    if (auth.getSessionProtocolCapability?.().available) {\n      if (!sessionProtocol) return\n      const guard = (effect: () => void) => auth.consumeSessionTicket(sessionProtocol, effect, event === 'SIGNED_OUT')\n      const tokenGuard = (effect: () => void, finalToken: string | null) => auth.consumeRealtimeToken(sessionProtocol, finalToken, this.supabaseKey, effect, event === 'SIGNED_OUT')\n      void guard(() => {\n        if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'MFA_CHALLENGE_VERIFIED') && this.changedAccessToken !== token) {\n          this.changedAccessToken = token\n          void (this.realtime as any).setAuth(token, tokenGuard).catch(() => {})\n        } else if (event === 'SIGNED_OUT') {\n          this.changedAccessToken = undefined\n          void (this.realtime as any).setAuth(null, tokenGuard).catch(() => {})\n        }\n      }).catch(() => {})\n      return\n    }\n    if (auth.getSessionProtocolCapability?.().protocol) return\n    if (\n      (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')");
  text = replaceOne(text, '      ...options,\n      params: { ...{ apikey: this.supabaseKey }, ...options?.params },',
    '      ...options,\n      sessionProtocolBoundary: {\n        active: () => Boolean((this.auth as any).getSessionProtocolCapability?.().protocol),\n        capture: () => (this.auth as any).captureSessionTicket(),\n        consume: (ticket: any, finalToken: string | null, effect: () => void) => (this.auth as any).consumeRealtimeToken(ticket, finalToken, this.supabaseKey, effect),\n      },\n      params: { ...{ apikey: this.supabaseKey }, ...options?.params },');
  text = replaceOne(text, '    const { data } = await this.auth.getSession()\n\n    return data.session?.access_token ?? this.supabaseKey',
    '    const result: any = await this.auth.getSession()\n\n    return result.purposeDenied ? this.supabaseKey : result.data?.session?.access_token ?? this.supabaseKey');
  return text;
}
export function patchRealtimeSource(text) {
  text = replaceOne(text, '  private _authPromise: Promise<void> | null = null',
    '  private _authPromise: Promise<void> | null = null\n  private _sessionProtocolBoundary?: any');
  text = replaceOne(text, '    this.accessToken = options?.accessToken ?? null',
    '    this.accessToken = options?.accessToken ?? null\n    this._sessionProtocolBoundary = (options as any)?.sessionProtocolBoundary');
  text = replaceOne(text, '  async setAuth(token: string | null = null): Promise<void> {\n    this._authPromise = this._performAuth(token)\n    try {\n      await this._authPromise\n    } finally {\n      this._authPromise = null\n    }\n  }',
    '  async setAuth(token: string | null = null, effectGuard?: (effect: () => void, finalToken: string | null) => Promise<boolean>): Promise<void> {\n    const pending = this._performAuth(token, effectGuard)\n    this._authPromise = pending\n    try { await pending } finally { if (this._authPromise === pending) this._authPromise = null }\n  }');
  text = replaceOne(text, '  private async _performAuth(token: string | null = null): Promise<void> {',
    '  private async _performAuth(token: string | null = null, effectGuard?: (effect: () => void, finalToken: string | null) => Promise<boolean>): Promise<void> {');
  text = replaceOne(text, '    let tokenToSend: string | null\n    let isManualToken = false',
    '    if (!effectGuard && this._sessionProtocolBoundary?.active()) {\n      const boundary = this._sessionProtocolBoundary\n      const ticket = await boundary.capture()\n      effectGuard = (effect, finalToken) => boundary.consume(ticket, finalToken, effect)\n    }\n    let tokenToSend: string | null\n    let isManualToken = false');
  const start = '    // Track whether this token was manually set or fetched via callback';
  text = replaceOne(text, start, '    const applyCurrentToken = () => {\n' + start);
  text = replaceOne(text, '    }\n  }\n\n  /**\n   * Wait for any in-flight auth operations to complete',
    '    }\n    }\n    if (effectGuard) { await effectGuard(applyCurrentToken, tokenToSend) } else { applyCurrentToken() }\n  }\n\n  /**\n   * Wait for any in-flight auth operations to complete');
  return text;
}

export function applySdkSourcePatch(nodeModules, ts, prototypeRoot) {
  const transformations = [
    ['@supabase/auth-js/src/GoTrueClient.ts', text => patchAuthSource(text, ts)],
    ['@supabase/supabase-js/src/SupabaseClient.ts', text => ({ text: patchSupabaseSource(text) })],
    ['@supabase/realtime-js/src/RealtimeClient.ts', text => ({ text: patchRealtimeSource(text) })],
  ];
  const manifest = [];
  for (const [relative, transform] of transformations) {
    const file = path.join(nodeModules, relative);
    const before = pinned(file, PINS[relative]);
    const patched = transform(before);
    fs.writeFileSync(file, patched.text, 'utf8');
    manifest.push({ file: relative, before: PINS[relative], after: digest(patched.text), census: patched.census });
  }
  const engine = fs.readFileSync(path.join(prototypeRoot, 'source/SessionProtocol.ts'));
  fs.writeFileSync(path.join(nodeModules, '@supabase/auth-js/src/lib/SessionProtocol.ts'), engine);
  // Callback context is additive; two-argument callers remain compatible.
  const typesPath = path.join(nodeModules, '@supabase/auth-js/src/lib/types.ts');
  let types = fs.readFileSync(typesPath, 'utf8').replace(/\r\n/g, '\n');
  types = types.replaceAll('callback: (event: AuthChangeEvent, session: Session | null) => void',
    'callback: (event: AuthChangeEvent, session: Session | null, sessionProtocol?: any) => void');
  fs.writeFileSync(typesPath, types);
  return manifest;
}
