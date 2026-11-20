import { loginResponseSchema } from '@sog/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { readStored } from './stored';

const user = { id: 'u-kim', name: '김하늘', role: 'manager', team: '재고관리팀' };

describe('readStored', () => {
  afterEach(() => localStorage.clear());

  it('스키마에 맞는 값만 돌려주고, 없거나 깨졌거나 옛 형식이면 null', () => {
    const read = () => readStored(() => localStorage, 'sog:auth', loginResponseSchema());
    expect(read()).toBeNull();
    localStorage.setItem('sog:auth', JSON.stringify({ token: 't', expiresAt: 1, user }));
    expect(read()).toEqual({ token: 't', expiresAt: 1, user });
    localStorage.setItem('sog:auth', '{깨진 JSON');
    expect(read()).toBeNull();
    // 옛 형식(만료 시각 없음)이나 모양이 다른 사용자
    localStorage.setItem('sog:auth', JSON.stringify({ token: 't', user }));
    expect(read()).toBeNull();
    localStorage.setItem('sog:auth', JSON.stringify({ token: 't', expiresAt: 1, user: { id: 1 } }));
    expect(read()).toBeNull();
  });

  it('저장소를 쓸 수 없는 환경에서도 던지지 않는다', () => {
    const blocked = () => {
      throw new DOMException('막힘', 'SecurityError');
    };
    expect(readStored(blocked, 'sog:auth', loginResponseSchema())).toBeNull();
    expect(readStored(() => null, 'sog:auth', loginResponseSchema())).toBeNull();
  });
});
