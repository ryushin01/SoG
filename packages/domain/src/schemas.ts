/**
 * 앱과 서버가 함께 쓰는 스키마(zod/mini): 기기 저장값과 로그인·상태 확인 응답, 확인 함수.
 * 서버만 쓰는 요청 본문 스키마는 `@sog/domain/requests`(request-schemas.ts)에 따로 둡니다. 한 모듈에 두면 앱 첫 화면과
 * 데모 서버 조각이 함께 가져와, 앱이 쓰지 않는 요청 스키마까지 첫 화면 묶음에 들어갑니다.
 * 스키마는 처음 부를 때 만들고(함수), 타입은 api.ts·types.ts의 인터페이스가 기준입니다(`Schema<인터페이스>`).
 */
import * as z from 'zod/mini';
import type { LoginResponse } from './api';
import type { User } from './types';

/** 스키마 타입(앱·서버가 zod를 직접 가져오지 않고 씁니다) */
export type Schema<T> = z.ZodMiniType<T>;

// ---------- 기기 저장값과 응답 ----------

function user(): Schema<User> {
  return z.object({
    id: z.string(),
    name: z.string(),
    role: z.enum(['manager', 'operator']),
    team: z.string(),
  });
}

let loginResponse: Schema<LoginResponse> | undefined;
/** 로그인 응답. 기기에 남기는 로그인 상태도 같은 모양입니다. */
export function loginResponseSchema(): Schema<LoginResponse> {
  return (loginResponse ??= z.object({ token: z.string(), expiresAt: z.number(), user: user() }));
}

let userList: Schema<User[]> | undefined;
export function userListSchema(): Schema<User[]> {
  return (userList ??= z.array(user()));
}

let health: Schema<{ mode: 'remote' | 'local' }> | undefined;
/** 실제 서버의 상태 확인(`/api/health`) 응답 */
export function healthSchema(): Schema<{ mode: 'remote' | 'local' }> {
  return (health ??= z.object({ mode: z.enum(['remote', 'local']) }));
}

let reloadMark: Schema<{ url: string; at: number }> | undefined;
/** 배포 뒤 사라진 화면 조각 때문에 주소를 새로 연 기록(같은 주소를 되풀이해 열지 않게) */
export function reloadMarkSchema(): Schema<{ url: string; at: number }> {
  return (reloadMark ??= z.object({ url: z.string(), at: z.number() }));
}

/**
 * 스키마로 값을 확인합니다. 맞으면 확인된 값(공백을 지운 글자 등), 아니면 첫 문구를 돌려줍니다.
 * 서버와 앱이 같은 방식으로 씁니다.
 */
export function check<T>(
  schema: Schema<T>,
  value: unknown,
): { ok: true; value: T } | { ok: false; message: string } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, message: result.error.issues[0]?.message ?? '입력 값을 확인해 주세요.' };
}
