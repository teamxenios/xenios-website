// Isolated SDK source-patch prototype. NOT an application adapter or rollout.
import { AuthError } from './errors'

export type ProtocolTicket = Readonly<{ protocol: string; epoch: string; revision: string }>
type Envelope = ProtocolTicket & { session: any; verifier: any; purpose: 'ordinary' | 'recovery' }
export type ProtocolOperation = { kind: string; revision: string; source: any; purpose: 'ordinary' | 'recovery'; ticket: ProtocolTicket }
export type ProtocolOptions = {
  rolloutBarrier: true; epoch: string
  lock: { run<T>(name: string, work: () => Promise<T>): Promise<T> }
  onObserverError?: () => void
}
const PROTOCOL = 'xenios-isolated-session-v1'
export class ProtocolError extends AuthError {
  constructor(code = 'session_transition_discarded') { super('Session protocol operation refused.', 409, code) }
}
export class SessionProtocol {
  private operations = new WeakSet<object>()
  private results = new WeakMap<object, ProtocolTicket>()
  private ready: Promise<unknown>
  private releaseReady!: () => void
  private readyBound = false
  private suspended = false
  recoveryDenied = false
  constructor(private storage: any, private key: string, private options: ProtocolOptions) {
    if (options?.rolloutBarrier !== true || !options.epoch || typeof options.lock?.run !== 'function') {
      throw new ProtocolError('session_protocol_unsupported')
    }
    this.ready = new Promise(resolve => { this.releaseReady = () => resolve(undefined) })
  }
  bindInitialization(promise: Promise<unknown>) {
    if (this.readyBound) return
    this.readyBound = true
    void promise.then(this.releaseReady, () => { this.suspended = true; this.releaseReady() })
  }
  async initialized() { await this.ready; this.available() }
  private available() { if (this.suspended) throw new ProtocolError('session_protocol_suspended') }
  private async load(): Promise<Envelope> {
    this.available()
    const raw = await this.storage.getItem(this.key)
    let value: any
    try { value = typeof raw === 'string' ? JSON.parse(raw) : null } catch { value = null }
    if (!value || value.protocol !== PROTOCOL || value.epoch !== this.options.epoch
      || typeof value.revision !== 'string' || !/^(0|[1-9][0-9]{0,60})$/.test(value.revision)
      || !Object.hasOwn(value, 'session') || value.verifier !== null
      || !['ordinary', 'recovery'].includes(value.purpose)
      || Object.keys(value).sort().join(',') !== 'epoch,protocol,purpose,revision,session,verifier') {
      this.suspended = true
      throw new ProtocolError('session_protocol_legacy_interference')
    }
    return value
  }
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    this.available()
    return this.options.lock.run('session-commit:' + this.key, work).catch(error => {
      if (error instanceof ProtocolError) throw error
      this.suspended = true
      throw new ProtocolError('session_protocol_storage_or_lock_failed')
    })
  }
  private ticket(value: ProtocolTicket): ProtocolTicket {
    return Object.freeze({ protocol: PROTOCOL, epoch: value.epoch, revision: value.revision })
  }
  private owns(op: ProtocolOperation) {
    if (!op || !this.operations.has(op)) throw new ProtocolError()
  }
  validate(op: ProtocolOperation) { this.owns(op) }
  private matches(ticket: ProtocolTicket, value: Envelope) {
    return ticket?.protocol === PROTOCOL && ticket.epoch === value.epoch && ticket.revision === value.revision
  }
  async begin(kind: string): Promise<ProtocolOperation> {
    // First read may be delayed. It NEVER silently rebases onto a newer read.
    const observed = await this.load()
    return this.exclusive(async () => {
      const current = await this.load()
      if (!this.matches(observed, current)) throw new ProtocolError('session_read_discarded')
      const op = { kind, revision: observed.revision, source: observed.session, purpose: observed.purpose, ticket: this.ticket(observed) }
      this.operations.add(op)
      return op
    })
  }
  async read(op: ProtocolOperation): Promise<any> {
    this.owns(op)
    return this.exclusive(async () => {
      const current = await this.load()
      if (!this.matches(op.ticket, current)) throw new ProtocolError('session_read_discarded')
      return current.session
    })
  }
  async commit(op: ProtocolOperation, session: any, verifier: any = null): Promise<void> {
    this.owns(op)
    await this.exclusive(async () => {
      const current = await this.load()
      if (!this.matches(op.ticket, current)) throw new ProtocolError()
      const revision = (BigInt(current.revision) + 1n).toString()
      const purpose = !session || op.kind === 'signInWithPassword' ? 'ordinary'
        : this.recoveryDenied || current.purpose === 'recovery' ? 'recovery' : 'ordinary'
      const value = { protocol: PROTOCOL, epoch: current.epoch, revision, session, verifier, purpose }
      // Single canonical-envelope write is the linearization point. No undo.
      await this.storage.setItem(this.key, JSON.stringify(value))
      op.revision = revision; op.ticket = this.ticket(value); op.purpose = purpose
      if (op.kind === 'signInWithPassword' && session) this.recoveryDenied = false
    })
  }
  async consume(ticket: ProtocolTicket, effect: (current: Envelope) => void, allowPurposeDenied = false): Promise<boolean> {
    return this.exclusive(async () => {
      const current = await this.load()
      if (!this.matches(ticket, current) || (this.recoveryDenied || current.purpose === 'recovery') && !allowPurposeDenied) return false
      effect(current) // No awaited observer work under the commit lock.
      return true
    })
  }
  async consumeToken(ticket: ProtocolTicket, token: string | null, anonymousKey: string, effect: () => void, allowPurposeDenied = false) {
    let applied = false
    const accepted = await this.consume(ticket, current => {
      if (token !== (current.session?.access_token ?? anonymousKey)) return
      effect(); applied = true
    }, allowPurposeDenied)
    return accepted && applied
  }
  async notify(op: ProtocolOperation, effect: (ticket: ProtocolTicket) => void) {
    this.owns(op)
    return this.consume(op.ticket, () => effect(op.ticket), true)
  }
  observerError() {
    // Never report observer payloads/errors through console or revoke a session.
    try { this.options.onObserverError?.() } catch { /* independent error sink */ }
  }
  observe(callback: (...args: any[]) => any, event: any, session: any, ticket: ProtocolTicket) {
    try { Promise.resolve(callback(event, session, ticket)).catch(() => this.observerError()) }
    catch { this.observerError() }
  }
  async receive(message: any, deliver: (event: any, session: any, op: ProtocolOperation) => Promise<any>) {
    if (!message?.sessionProtocol || message.sessionProtocol.protocol !== PROTOCOL) {
      this.suspended = true
      return false
    }
    const op = await this.begin('broadcast')
    if (!this.matches(message.sessionProtocol, { ...op.ticket, session: op.source, verifier: null, purpose: op.purpose })) return false
    const signedOut = message.event === 'SIGNED_OUT'
    if (!['SIGNED_IN', 'SIGNED_OUT', 'PASSWORD_RECOVERY', 'TOKEN_REFRESHED', 'USER_UPDATED', 'MFA_CHALLENGE_VERIFIED'].includes(message.event)
      || signedOut !== (op.source === null)
      || (message.session?.access_token ?? null) !== (op.source?.access_token ?? null)) return false
    // Receive re-reads canonical data; it never trusts a broadcast's session body.
    await deliver(message.event, op.source, op)
    return true
  }
  async run(kind: string, work: (op: ProtocolOperation) => Promise<any>) {
    try {
      if (kind !== '_initialize') await this.initialized()
      const op = await this.begin(kind)
      if ((this.recoveryDenied || op.purpose === 'recovery') && ['_verify', '_challenge', '_challengeAndVerify'].includes(kind)) {
        throw new ProtocolError('session_recovery_purpose_denied')
      }
      const result = await work(op)
      let accepted = false
      await this.consume(op.ticket, () => { accepted = true }, true)
      if (!accepted) throw new ProtocolError()
      const returned = { ...result, sessionProtocol: op.ticket, purposeDenied: this.recoveryDenied || op.purpose === 'recovery' }
      this.results.set(returned, op.ticket)
      return returned
    } catch (error) {
      if (error instanceof ProtocolError) {
        return { data: kind === 'getSession' ? { session: null } : kind === 'getUser' ? { user: null } : null, error }
      }
      throw error
    }
  }
  async consumeResult(result: any, effect: (result: any) => void) {
    const ticket = result && this.results.get(result)
    if (!ticket || result.purposeDenied || this.recoveryDenied) return false
    return this.consume(ticket, () => effect(result))
  }
  async conditionalRecoveryClear(expectedToken: string) {
    this.recoveryDenied = true // immediate purpose/UI fence, not a committed sign-out
    const op = await this.begin('recovery-clear')
    if (!expectedToken || op.source?.access_token !== expectedToken) throw new ProtocolError()
    await this.commit(op, null)
    return op
  }
  get capability() { return { protocol: PROTOCOL, available: !this.suspended, rolloutBarrier: true } }
}
