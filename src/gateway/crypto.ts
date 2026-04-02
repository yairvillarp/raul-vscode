import * as crypto from 'crypto';

export interface DeviceIdentity {
  deviceId: string;
  publicKey: string;
  signature: string;
  signedAt: number;
}

export function generateDeviceIdentity(token: string, nonce: string): DeviceIdentity {
  // Generate Ed25519 key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  
  // Export public key as raw 32 bytes
  const rawPublicKey = publicKey.export({ type: 'spki', format: 'der' });
  // Strip ASN.1 header to get raw 32-byte key
  // Ed25519 SPKI header is 16 bytes: 302a300506032b6570032100
  const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
  const raw32 = rawPublicKey.slice(ED25519_SPKI_PREFIX.length);
  
  // Derive device ID: SHA-256 of raw key (same as OpenClaw)
  const deviceId = crypto.createHash('sha256').update(raw32).digest('hex');
  
  // Build signed payload matching OpenClaw gateway format:
  // v2|deviceId|clientId|clientMode|role|scopesCsv|signedAtMs|token|nonce
  const signedAtMs = Date.now();
  const clientId = 'cli';
  const clientMode = 'cli';
  const role = 'operator';
  const scopesCsv = 'operator.read,operator.write,operator.admin';
  
  const signPayload = `v2|${deviceId}|${clientId}|${clientMode}|${role}|${scopesCsv}|${signedAtMs}|${token}|${nonce}`;
  
  // Sign using Ed25519 (null hash = pure Ed25519)
  const signature = crypto.sign(null, Buffer.from(signPayload, 'utf8'), privateKey);
  
  // Encode public key as base64url
  const publicKeyBase64url = raw32.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  // Encode signature as base64url
  const signatureBase64url = signature.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  return { deviceId, publicKey: publicKeyBase64url, signature: signatureBase64url, signedAt: signedAtMs };
}
