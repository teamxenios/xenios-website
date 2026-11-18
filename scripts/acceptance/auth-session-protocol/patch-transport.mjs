// Build-time owned-copy patches. No live SDK method/global replacement.
export const TRANSPORT_PINS = Object.freeze({
  '@supabase/realtime-js/src/RealtimeChannel.ts': '229ce1996373096490d9d4179c1aa759bc3ef6383ce825e4fcb68934c500aa6b',
  '@supabase/realtime-js/src/phoenix/channelAdapter.ts': '8d68260e686f4c39abfd4534611598dbf46e78effb8d3fb53f8aedf45c1f0195',
  '@supabase/supabase-js/src/lib/fetch.ts': 'd66c29ef2c91756e969a88515f760aca5ef82b27c443d0d404b4759cdae96596',
  '@supabase/phoenix/assets/js/phoenix/socket.js': 'b55ee199522de4c1f1772be7159ae68f082f8b2b58b37c8e2571e88669e74fc6',
  '@supabase/phoenix/assets/js/phoenix/channel.js': 'b2faff72bc9c136c8f4337cdcaa4fc9d3dd4bd35525c40a126d1b901f96621e5',
  '@supabase/phoenix/assets/js/phoenix/push.js': '09ebf09ac836f67b982f5a9936a603b7198710a4bc71f9a3996bf465504e0d77',
});
const one = (text, before, after) => {
  if (text.split(before).length !== 2) throw new Error('TRANSPORT_SOURCE_ANCHOR_CHANGED');
  return text.replace(before, after);
};
const all = (text, before, after, count) => {
  if (text.split(before).length !== count + 1) throw new Error('TRANSPORT_SOURCE_CENSUS_CHANGED');
  return text.replaceAll(before, after);
};
export function patchChannelAdapter(text) {
  return one(text, '  updateJoinPayload(payload: Record<string, any>) {',
    '  setSessionProtocolFrame(frame: any) { (this.channel as any).sessionProtocolFrame = frame }\n  retireSessionProtocolFrame() { this.channel.teardown(); this.socket.getSocket().remove(this.channel) }\n\n  updateJoinPayload(payload: Record<string, any>) {');
}
export function patchRealtimeChannel(text) {
  text = one(text, '  bindings: Record<string, Binding[]> = {}', `  private _sessionProtocolFrame: any
  getSessionProtocolFrame() { return this._sessionProtocolFrame }
  setSessionProtocolFrame(frame: any) {
    this._sessionProtocolFrame = frame
    ;(this.channelAdapter as any).setSessionProtocolFrame(frame)
  }
  retireSessionProtocolFrame() { (this.channelAdapter as any).retireSessionProtocolFrame() }
  bindings: Record<string, Binding[]> = {}`);
  text = one(text, '    timeout = this.timeout\n  ): RealtimeChannel {', `    timeout = this.timeout,
    __sessionFrame?: any
  ): RealtimeChannel {
    const boundary = (this.socket as any).getSessionProtocolBoundary()
    if (boundary && !__sessionFrame) {
      const capture = this._sessionProtocolFrame ? Promise.resolve(this._sessionProtocolFrame) : boundary.captureFrame()
      void capture.then((frame: any) => {
        if (this.private && !boundary.authenticated(frame)) return false
        return boundary.consumeFrame(frame, () => {
          ;(this.socket as any).adoptSessionProtocolFrame(frame)
          this.setSessionProtocolFrame(frame)
          this.subscribe(callback, timeout, frame)
        })
      }).then((accepted: boolean) => {
        if (!accepted) callback?.(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, new Error('Session work discarded.'))
      }).catch(() => callback?.(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, new Error('Session work discarded.')))
      return this
    }`);
  text = one(text, '      if (this.socket.accessTokenValue) {\n        accessTokenPayload.access_token = this.socket.accessTokenValue\n      }',
    '      const joinToken = boundary ? boundary.token(__sessionFrame) : this.socket.accessTokenValue\n      if (joinToken) accessTokenPayload.access_token = joinToken');
  text = one(text, '      this.updateJoinPayload({ ...{ config }, ...accessTokenPayload })',
    '      this.updateJoinPayload({ ...{ config }, ...accessTokenPayload }, __sessionFrame, Boolean(boundary))');
  text = one(text, '    opts: { timeout?: number } = {}\n  ): Promise<{ success: true } | { success: false; status: number; error: string }> {',
    `    opts: { timeout?: number } = {},
    __sessionFrame?: any
  ): Promise<{ success: true } | { success: false; status: number; error: string }> {
    const boundary = (this.socket as any).getSessionProtocolBoundary()
    if (boundary && !__sessionFrame) {
      const frame = this._sessionProtocolFrame ?? await boundary.captureFrame()
      if (this.private && !boundary.authenticated(frame)) throw new Error('Session work discarded.')
      let pending: any
      const accepted = await boundary.consumeFrame(frame, () => { pending = this.httpSend(event, payload, opts, frame) })
      if (!accepted) throw new Error('Session work discarded.')
      return await pending
    }`);
  text = one(text, "    opts: { [key: string]: any } = {}\n  ): Promise<RealtimeChannelSendResponse> {", `    opts: { [key: string]: any } = {},
    __sessionFrame?: any
  ): Promise<RealtimeChannelSendResponse> {
    const boundary = (this.socket as any).getSessionProtocolBoundary()
    if (boundary && !__sessionFrame) {
      const frame = this._sessionProtocolFrame ?? await boundary.captureFrame()
      if (this.private && !boundary.authenticated(frame)) return 'error'
      let pending: any
      const accepted = await boundary.consumeFrame(frame, () => { pending = this.send(args, opts, frame) })
      if (!accepted) return 'error'
      return await pending
    }`);
  text = one(text, '    if (this.socket.accessTokenValue) {\n      headers[\'Authorization\'] = `Bearer ${this.socket.accessTokenValue}`\n    }',
    '    const httpToken = boundary ? boundary.token(__sessionFrame) : this.socket.accessTokenValue\n    if (httpToken) headers[\'Authorization\'] = `Bearer ${httpToken}`');
  text = one(text, '      if (this.socket.accessTokenValue) {\n        headers[\'Authorization\'] = `Bearer ${this.socket.accessTokenValue}`\n      }',
    '      const httpToken = boundary ? boundary.token(__sessionFrame) : this.socket.accessTokenValue\n      if (httpToken) headers[\'Authorization\'] = `Bearer ${httpToken}`');
  text = one(text, '      opts.timeout ?? this.timeout\n    )', '      opts.timeout ?? this.timeout,\n      __sessionFrame\n    )');
  text = one(text, '          opts.timeout ?? this.timeout\n        )', '          opts.timeout ?? this.timeout,\n          __sessionFrame\n        )');
  text = one(text, '  updateJoinPayload(payload: Record<string, any>) {\n    this.channelAdapter.updateJoinPayload(payload)\n  }', `  updateJoinPayload(payload: Record<string, any>, __sessionFrame?: any, __checked = false) {
    const boundary = (this.socket as any).getSessionProtocolBoundary()
    if (boundary) {
      const frame = __sessionFrame ?? this._sessionProtocolFrame
      if (!__checked) { void boundary.consumeFrame(frame, () => this.updateJoinPayload(payload, frame, true)).catch(() => {}); return }
      const token = boundary.token(frame)
      if ('access_token' in payload && payload.access_token !== token) return
      this.channelAdapter.updateJoinPayload({ ...payload, access_token: token })
      return
    }
    this.channelAdapter.updateJoinPayload(payload)
  }`);
  text = one(text, '  async _fetchWithTimeout(url: string, options: { [key: string]: any }, timeout: number) {\n    const controller = new AbortController()\n    const id = setTimeout(() => controller.abort(), timeout)\n\n    const response = await this.socket.fetch(url, {\n      ...options,\n      signal: controller.signal,\n    })\n\n    clearTimeout(id)\n\n    return response\n  }', `  async _fetchWithTimeout(url: string, options: { [key: string]: any }, timeout: number, frame?: any) {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeout)
    try {
      const boundary = (this.socket as any).getSessionProtocolBoundary()
      let pending: any
      const dispatch = () => { pending = this.socket.fetch(url, { ...options, signal: controller.signal,
        ...(boundary ? { __xeniosSessionFrame: frame } : {}) } as any) }
      if (boundary) {
        if (!await boundary.consumeFrame(frame, dispatch)) throw new Error('Session work discarded.')
      } else dispatch()
      return await pending
    } finally { clearTimeout(id) }
  }`);
  return text;
}
export function patchSupabaseFetch(text) {
  text = one(text, '  tracePropagationOptions?: TracePropagationOptions\n): Fetch => {',
    '  tracePropagationOptions?: TracePropagationOptions,\n  sessionProtocolBoundary?: any\n): Fetch => {');
  text = one(text, '  return async (input, init) => {\n    const accessToken', `  return async (input, init) => {
    const boundary = sessionProtocolBoundary?.active() ? sessionProtocolBoundary : null
    const frame = boundary ? (init as any)?.__xeniosSessionFrame ?? await boundary.captureFrame() : null
    const accessToken`);
  return one(text, '    return fetch(input, { ...init, headers })', `    const { __xeniosSessionFrame: _discardedFrame, ...requestInit } = (init ?? {}) as any
    if (!boundary) return fetch(input, { ...requestInit, headers })
    let pending: any
    const accepted = await boundary.consumeFrame(frame, () => {
      if (headers.get('Authorization') !== 'Bearer ' + boundary.token(frame)) return
      pending = fetch(input, { ...requestInit, headers })
    })
    if (!accepted || !pending) throw new Error('Session work discarded.')
    return await pending`);
}
export function patchPhoenixSocket(text) {
  text = one(text, '  constructor(endPoint, opts = {}){', '  constructor(endPoint, opts = {}){\n    this.sessionProtocolBoundary = opts.sessionProtocolBoundary');
  text = one(text, '  transportConnect(){', `  transportConnect(){
    if(this.sessionProtocolBoundary?.active() && this.transport === LongPoll) throw new Error('Session protocol transport unsupported.')`);
  text = one(text, '    this.conn.onopen = () => this.onConnOpen()\n    this.conn.onerror = error => this.onConnError(error)\n    this.conn.onmessage = event => this.onConnMessage(event)\n    this.conn.onclose = event => this.onConnClose(event)', `    const connection = this.conn
    this.conn.onopen = () => { if(this.conn === connection) this.onConnOpen() }
    this.conn.onerror = error => { if(this.conn === connection) this.onConnError(error) }
    this.conn.onmessage = event => this.onConnMessage(event, connection)
    this.conn.onclose = event => { if(this.conn === connection) this.onConnClose(event) }`);
  text = one(text, '  onConnMessage(rawMessage){\n    this.decode(rawMessage.data, msg => {', `  onConnMessage(rawMessage, connection = this.conn){
    if(this.conn !== connection) return
    this.decode(rawMessage.data, msg => {
      if(this.conn !== connection) return`);
  return one(text, '  push(data){', `  push(data, sessionFrame){
    const boundary = this.sessionProtocolBoundary
    if(boundary?.active()){
      if(!sessionFrame){
        if(data.topic === 'phoenix' && data.event === 'heartbeat'){
          void boundary.captureFrame().then(frame => this.push(data, frame)).catch(() => {})
        }
        return
      }
      const send = () => {
        void boundary.consumeFrame(sessionFrame, () => {
          if((data.event === 'phx_join' || data.event === 'access_token') && data.payload?.access_token !== boundary.token(sessionFrame)) return
          const connection = this.conn
          if(!connection || !this.isConnected()) return
          this.encode(data, encoded => {
            void boundary.consumeFrame(sessionFrame, () => {
              if(this.conn === connection && this.isConnected()) connection.send(encoded)
            }).catch(() => {})
          })
        }).catch(() => {})
      }
      if(this.isConnected()) send()
      else this.sendBuffer.push(send)
      return
    }`);
}
export function patchPhoenixPush(text) {
  text = one(text, '    this.channel = channel', `    this.channel = channel
    this.sessionProtocolFrame = channel.sessionProtocolFrame
    this.sessionProtocolSettled = false
    this.sessionProtocolCancelled = false
    if(channel.socket.sessionProtocolBoundary?.active()){
      channel.sessionProtocolPushes ??= new Set()
      channel.sessionProtocolPushes.add(this)
    }`);
  text = one(text, '  resend(timeout){\n    this.timeout = timeout', '  resend(timeout, frame = this.sessionProtocolFrame){\n    this.sessionProtocolFrame = frame\n    this.timeout = timeout');
  text = one(text, '  send(){', `  send(checked = false){
    const boundary = this.channel.socket.sessionProtocolBoundary
    if(boundary?.active() && (this.channel.sessionProtocolRetired || this.sessionProtocolSettled)){
      if(!this.sessionProtocolSettled) this.settleSessionStale()
      return
    }
    if(boundary?.active() && !checked){
      ;(this.channel.sessionProtocolPushes ??= new Set()).add(this)
      void boundary.consumeFrame(this.sessionProtocolFrame, () => this.send(true))
        .then(accepted => { if(!accepted) this.settleSessionStale() })
        .catch(() => this.settleSessionStale())
      return
    }`);
  text = one(text, '      join_ref: this.channel.joinRef()\n    })', '      join_ref: this.channel.joinRef()\n    }, this.sessionProtocolFrame)');
  text = one(text, '  reset(){', '  reset(){\n    if(this.sessionProtocolCancelled || this.channel.sessionProtocolRetired) return\n    this.sessionProtocolSettled = false');
  text = one(text, '  destroy(){', '  destroy(){\n    if(this.channel.socket.sessionProtocolBoundary?.active()) this.settleSessionStale()');
  text = one(text, '  matchReceive({status, response, _ref}){', `  matchReceive({status, response, _ref}){
    if(this.channel.socket.sessionProtocolBoundary?.active()){
      if(this.sessionProtocolSettled) return
      this.sessionProtocolSettled = true
      this.channel.sessionProtocolPushes?.delete(this)
    }`);
  return one(text, '  trigger(status, response){', `  settleSessionTerminal(status, response){
    if(this.sessionProtocolSettled) return
    this.sessionProtocolSettled = true
    this.cancelRefEvent()
    this.cancelTimeout()
    this.channel.sessionProtocolPushes?.delete(this)
    this.receivedResp = {status, response}
    // Terminal status is independent of old data admission. No old payload,
    // resend, or observer exception may keep another receiver unresolved.
    for(const hook of [...this.recHooks]){
      if(hook.status !== status) continue
      try { Promise.resolve(hook.callback(response)).catch(() => {}) } catch {}
    }
  }

  settleSessionStale(){
    if(this.sessionProtocolCancelled) return
    this.sessionProtocolCancelled = true
    this.settleSessionTerminal('error', {reason: 'session_work_discarded'})
  }

  trigger(status, response){
    if(this.channel.socket.sessionProtocolBoundary?.active() && status === 'timeout'){
      // A local timer carries no remote data and must settle even if a later
      // canonical revision makes Channel.trigger refuse payload callbacks.
      this.settleSessionTerminal('timeout', {})
      return
    }`);
}
export function patchPhoenixChannel(text) {
  text = one(text, '  teardown(){', `  teardown(){
    if(this.socket.sessionProtocolBoundary?.active()){
      this.sessionProtocolRetired = true
      for(const push of [...(this.sessionProtocolPushes ?? [])]) push.settleSessionStale()
      this.sessionProtocolPushes?.clear()
    }`);
  text = one(text, '      if(this.socket.isConnected()){ this.rejoin() }', '      if(this.socket.isConnected()){ this.rejoin(undefined, this.sessionProtocolRejoinFrame) }');
  text = one(text, '      if(this.isErrored()){ this.rejoin() }', '      if(this.isErrored()){ this.rejoin(undefined, this.sessionProtocolRejoinFrame) }');
  text = all(text, 'this.rejoinTimer.scheduleTimeout()', 'this.scheduleSessionRejoin()', 3);
  text = one(text, '  rejoin(timeout = this.timeout){', `  scheduleSessionRejoin(){
    if(this.sessionProtocolRetired) return
    this.sessionProtocolRejoinFrame = this.sessionProtocolFrame
    this.rejoinTimer.scheduleTimeout()
  }

  rejoin(timeout = this.timeout, frame = this.sessionProtocolFrame, checked = false){
    if(this.sessionProtocolRetired) return
    const boundary = this.socket.sessionProtocolBoundary
    if(boundary?.active() && !checked){
      void boundary.consumeFrame(frame, () => this.rejoin(timeout, frame, true)).catch(() => {})
      return
    }`);
  text = one(text, '    this.joinPush.resend(timeout)', '    this.joinPush.resend(timeout, frame)');
  return one(text, '  trigger(event, payload, ref, joinRef){', `  trigger(event, payload, ref, joinRef, checked = false){
    const boundary = this.socket.sessionProtocolBoundary
    if(boundary?.active() && !checked){
      const frame = this.sessionProtocolFrame
      void boundary.consumeFrame(frame, () => this.trigger(event, payload, ref, joinRef, true)).catch(() => {})
      return
    }`);
}
