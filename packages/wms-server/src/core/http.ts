/** 응답 만들기, 경로 맞추기, 쿼리·본문 값 검사 */
import { check, type Schema } from '@sog/domain';
import { HttpError, type ServerResponse } from './types';

export function json(
  status: number,
  body: unknown,
  etag?: number,
  extra: Record<string, string> = {},
): ServerResponse {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  if (etag !== undefined) headers['ETag'] = `"${etag}"`;
  return { status, headers, body };
}

export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/');
  const b = path.replace(/\/$/, '').split('/');
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    const part = a[i]!;
    if (part.startsWith(':')) {
      // 깨진 퍼센트 인코딩(%E0%A4%A 등)은 없는 경로로 봅니다(500이 아니라 404).
      const value = safeDecode(b[i]!);
      if (value === null) return null;
      params[part.slice(1)] = value;
    } else if (part !== b[i]) return null;
  }
  return params;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** 목록 개수 상한. 화면은 최대 100건(활동 기록)을 씁니다. */
export const MAX_LIST_LIMIT = 200;

/** 쿼리의 정수 값. 숫자가 아니면 기본값, 범위를 넘으면 끝 값으로 맞춥니다. */
export function intParam(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** 쓰기 목록에 넣을 행. 타입을 확인한 뒤 저장소 공통 형태로 넘깁니다. */
export function row<T extends { id: string }>(value: T): { id: string } {
  return value;
}

export function positiveInt(value: unknown, label: string, allowZero = false): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new HttpError(
      400,
      'VALIDATION',
      `${label}은(는) ${allowZero ? '0 이상' : '1 이상'}의 정수여야 합니다.`,
    );
  }
  if (value > 1_000_000) throw new HttpError(400, 'VALIDATION', `${label}이(가) 너무 큽니다.`);
  return value;
}

export function text(value: unknown, label: string, max = 200, required = true): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (required && !trimmed) throw new HttpError(400, 'VALIDATION', `${label}을(를) 입력해 주세요.`);
  if (trimmed.length > max)
    throw new HttpError(400, 'VALIDATION', `${label}은(는) ${max}자 이내로 입력해 주세요.`);
  return trimmed;
}

/** 요청 본문을 스키마로 확인합니다(@sog/domain의 schemas). 맞지 않으면 400과 첫 문구로 답합니다. */
export function parseBody<T>(schema: Schema<T>, body: unknown): T {
  const result = check(schema, body ?? {});
  if (!result.ok) throw new HttpError(400, 'VALIDATION', result.message);
  return result.value;
}
