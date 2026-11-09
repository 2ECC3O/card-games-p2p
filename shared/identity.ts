/** Native signatures keep reusable seat credentials off the wire, including during takeover. */
export interface Signer { privateKey: CryptoKey; publicKey: JsonWebKey }
const algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
const signatureAlgorithm = { name: 'ECDSA', hash: 'SHA-256' };
const bytes = (parts: string[]) => new TextEncoder().encode(JSON.stringify(parts));
export const nonce = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
export const validNonce = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const validPublicKey = (key: unknown): key is JsonWebKey => {
  const k = key as JsonWebKey | null;
  return !!k && k.kty === 'EC' && k.crv === 'P-256' && k.d === undefined
    && typeof k.x === 'string' && /^[\w-]{43}$/.test(k.x) && typeof k.y === 'string' && /^[\w-]{43}$/.test(k.y);
};
export const sameKey = (a: JsonWebKey | null, b: JsonWebKey) => !!a && a.x === b.x && a.y === b.y && a.crv === b.crv;

export async function loadSigner(id: string, secret: string): Promise<Signer> {
  if (!crypto.subtle) throw new Error('Secure room connections need HTTPS or localhost.');
  const storageKey = `card-games.signer.${id}`;
  const saved = sessionStorage.getItem(storageKey);
  if (saved) {
    const record = JSON.parse(saved) as { secret: string; privateKey: JsonWebKey; publicKey: JsonWebKey };
    if (record.secret === secret && validPublicKey(record.publicKey)) {
      return { privateKey: await crypto.subtle.importKey('jwk', record.privateKey, algorithm, false, ['sign']), publicKey: record.publicKey };
    }
  }
  const keys = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  const publicKey = await crypto.subtle.exportKey('jwk', keys.publicKey);
  sessionStorage.setItem(storageKey, JSON.stringify({ secret, publicKey, privateKey: await crypto.subtle.exportKey('jwk', keys.privateKey) }));
  return { privateKey: keys.privateKey, publicKey };
}

export async function sign(signer: Signer, parts: string[]): Promise<string> {
  const signature = await crypto.subtle.sign(signatureAlgorithm, signer.privateKey, bytes(parts));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verify(publicKey: JsonWebKey, signature: unknown, parts: string[]): Promise<boolean> {
  if (!validPublicKey(publicKey) || typeof signature !== 'string' || !/^[a-f0-9]{128}$/.test(signature)) return false;
  try {
    const key = await crypto.subtle.importKey('jwk', publicKey, algorithm, false, ['verify']);
    return await crypto.subtle.verify(signatureAlgorithm, key, Uint8Array.from(signature.match(/../g)!, (s) => parseInt(s, 16)), bytes(parts));
  } catch {
    return false;
  }
}
