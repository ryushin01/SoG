import { check, type Schema } from '@sog/domain';

/**
 * 기기 저장값(localStorage·sessionStorage) 읽기. 없거나, JSON이 깨졌거나, 스키마에 맞지 않으면(옛 형식 등) null입니다.
 * 저장 공간을 쓸 수 없는 환경(비공개 모드, 막힌 저장소)에서도 던지지 않아 앱이 첫 화면에서 멈추지 않습니다.
 */
export function readStored<T>(
  storage: () => Storage | null | undefined,
  key: string,
  schema: Schema<T>,
): T | null {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const result = check(schema, JSON.parse(raw));
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}
