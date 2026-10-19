import crypto from 'node:crypto';
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function need(value, message) { if (!value) throw new Error(message); }
