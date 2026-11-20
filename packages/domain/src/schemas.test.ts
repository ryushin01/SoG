import { describe, expect, it } from 'vitest';
import {
  createOrderRequestSchema,
  intInput,
  movementRequestSchema,
  optionalText,
  skuPatchSchema,
  textInput,
} from './request-schemas';
import { check, loginResponseSchema, userListSchema } from './schemas';

const message = (result: ReturnType<typeof check>) => (result.ok ? null : result.message);

describe('입력 스키마', () => {
  it('정수 입력은 서버가 쓰던 문구로 거절하고, 0 허용 여부와 상한을 지킨다', () => {
    const qty = intInput('수량');
    expect(check(qty, 3)).toEqual({ ok: true, value: 3 });
    for (const value of [0, 1.5, '3', null, Number.NaN]) {
      expect(message(check(qty, value))).toBe('수량은(는) 1 이상의 정수여야 합니다.');
    }
    expect(message(check(qty, 1_000_001))).toBe('수량이(가) 너무 큽니다.');
    expect(check(intInput('안전 재고', true), 0)).toEqual({ ok: true, value: 0 });
  });

  it('글자 입력은 앞뒤 공백을 지우고, 비었거나 길면 거절한다', () => {
    const reason = textInput('사유', 5);
    expect(check(reason, '  입고  ')).toEqual({ ok: true, value: '입고' });
    expect(message(check(reason, '   '))).toBe('사유을(를) 입력해 주세요.');
    expect(message(check(reason, 7))).toBe('사유을(를) 입력해 주세요.');
    expect(message(check(reason, '여섯 글자요'))).toBe('사유은(는) 5자 이내로 입력해 주세요.');
    expect(check(optionalText('메모', 5), undefined)).toEqual({ ok: true, value: undefined });
  });

  it('입출고 요청은 유형에 맞는 로케이션을 요구한다', () => {
    const receipt = { type: 'receipt', skuId: 's', toLocationId: 'l', qty: 2, reason: ' 입고 ' };
    expect(check(movementRequestSchema(), receipt)).toEqual({
      ok: true,
      value: { ...receipt, reason: '입고' },
    });
    expect(message(check(movementRequestSchema(), { ...receipt, type: 'gift' }))).toBe(
      '이동 유형을 선택해 주세요.',
    );
    expect(message(check(movementRequestSchema(), { ...receipt, toLocationId: '' }))).toBe(
      '로케이션을 선택해 주세요.',
    );
  });

  it('출고 지시는 품목 1~20줄, 품목 수정은 보낸 값만 확인한다', () => {
    const order = { customer: '새솔', assigneeId: 'u-lee', dueAt: '2026-11-21T00:00:00Z' };
    expect(message(check(createOrderRequestSchema(), { ...order, lines: [] }))).toBe(
      '품목을 하나 이상 넣어 주세요.',
    );
    const many = Array.from({ length: 21 }, (_, i) => ({ skuId: `s${i}`, qty: 1 }));
    expect(message(check(createOrderRequestSchema(), { ...order, lines: many }))).toBe(
      '품목은 20개까지 넣을 수 있습니다.',
    );
    expect(message(check(createOrderRequestSchema(), { ...order, dueAt: '어제', lines: [] }))).toBe(
      '출고 마감을 입력해 주세요.',
    );
    expect(check(skuPatchSchema(), { safetyStock: 40 })).toEqual({
      ok: true,
      value: { safetyStock: 40 },
    });
    expect(message(check(skuPatchSchema(), { name: '  ' }))).toBe('품목명을(를) 입력해 주세요.');
  });
});

describe('저장값·응답 스키마', () => {
  it('로그인 상태와 사용자 목록이 옛 형식이거나 깨졌으면 거절한다', () => {
    const user = { id: 'u-kim', name: '김하늘', role: 'manager', team: '재고관리팀' };
    expect(check(loginResponseSchema(), { token: 't', expiresAt: 1, user }).ok).toBe(true);
    expect(check(loginResponseSchema(), { token: 't', user }).ok).toBe(false);
    expect(check(loginResponseSchema(), { token: 't', expiresAt: 1, user: { id: 'u' } }).ok).toBe(
      false,
    );
    expect(check(userListSchema(), [user]).ok).toBe(true);
    expect(check(userListSchema(), [{ ...user, role: 'admin' }]).ok).toBe(false);
  });
});
