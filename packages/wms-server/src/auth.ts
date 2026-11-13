/**
 * 로그인 토큰. `사용자ID.만료(초).서명`을 base64url로 이은 짧은 토큰을 HMAC-SHA256으로 서명합니다.
 * Web Crypto만 써서 브라우저(데모 모드)와 서버(실제 서버 모드)에서 같은 코드가 돕니다.
 */

/** 데모 계정의 공개 비밀번호. 로그인 화면에 그대로 안내합니다. 실제 서비스의 비밀번호가 아닙니다. */
export const DEMO_PASSWORD = 'sog-demo';

/** 데모 모드(브라우저 안 서버)의 서명 키. 브라우저 안에서는 비밀일 수 없으므로 고정 값을 씁니다. */
export const LOCAL_AUTH_SECRET = 'sog-local-demo-secret';

export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded =
      text.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (text.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const keys = new Map<string, Promise<CryptoKey>>();

function key(secret: string): Promise<CryptoKey> {
  let cached = keys.get(secret);
  if (!cached) {
    cached = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
    keys.set(secret, cached);
  }
  return cached;
}

export async function issueToken(
  secret: string,
  userId: string,
  nowSeconds: number,
  ttl = TOKEN_TTL_SECONDS,
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = nowSeconds + ttl;
  const payload = `${base64url(encoder.encode(userId))}.${expiresAt}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload)),
  );
  return { token: `${payload}.${base64url(signature)}`, expiresAt };
}

/** 서명과 만료를 확인하고 사용자 ID를 돌려줍니다. 맞지 않으면 null */
export async function verifyToken(
  secret: string,
  token: string,
  nowSeconds: number,
): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [user, exp, sig] = parts as [string, string, string];
  const expiresAt = Number(exp);
  if (!Number.isInteger(expiresAt) || expiresAt <= nowSeconds) return null;
  const signature = fromBase64url(sig);
  const userBytes = fromBase64url(user);
  if (!signature || !userBytes) return null;
  // verify는 상수 시간으로 비교합니다.
  const ok = await crypto.subtle.verify(
    'HMAC',
    await key(secret),
    signature,
    encoder.encode(`${user}.${exp}`),
  );
  return ok ? new TextDecoder().decode(userBytes) : null;
}
