import { describe, expect, it } from 'vitest';
import {
  accuracyRate,
  available,
  ean13CheckDigit,
  formatDelta,
  isValidEan13,
  movementEffect,
  settledOnHand,
  stockStatus,
  variance,
} from './rules';
import { skuArtSvg } from './art';

describe('재고 규칙', () => {
  it('가용 재고는 묶인 수량을 빼고 0 아래로 내려가지 않는다', () => {
    expect(available(10, 3)).toBe(7);
    expect(available(2, 5)).toBe(0);
  });

  it('안전 재고보다 적으면 부족, 0이면 품절', () => {
    expect(stockStatus(0, 10)).toBe('out');
    expect(stockStatus(9, 10)).toBe('low');
    expect(stockStatus(10, 10)).toBe('ok');
  });

  it('실사 차이와 정확도', () => {
    expect(variance({ countedQty: null, expectedQty: 4 })).toBeNull();
    expect(variance({ countedQty: 3, expectedQty: 4 })).toBe(-1);
    expect(
      accuracyRate([
        { countedQty: 4, expectedQty: 4 },
        { countedQty: 3, expectedQty: 4 },
        { countedQty: null, expectedQty: 1 },
      ]),
    ).toBe(50);
    expect(accuracyRate([])).toBeNull();
  });

  it('승인 수량은 센 수량에 그 뒤 이동을 더한다', () => {
    expect(settledOnHand(10, 4)).toBe(14);
    expect(settledOnHand(2, -5)).toBe(0);
  });

  it('이동 한 건이 로케이션 재고에 주는 영향', () => {
    const transfer = {
      type: 'transfer' as const,
      fromLocationId: 'a',
      toLocationId: 'b',
      qty: 3,
      delta: 0,
    };
    expect(movementEffect(transfer, 'a')).toBe(-3);
    expect(movementEffect(transfer, 'b')).toBe(3);
    expect(movementEffect(transfer, 'c')).toBe(0);
    expect(
      movementEffect(
        { type: 'count', fromLocationId: null, toLocationId: 'a', qty: 2, delta: -2 },
        'a',
      ),
    ).toBe(-2);
  });

  it('증감 표기는 빼기 기호를 쓴다', () => {
    expect(formatDelta(3)).toBe('+3');
    expect(formatDelta(-1200)).toBe('−1,200');
    expect(formatDelta(0)).toBe('0');
  });

  it('EAN-13 검사 숫자', () => {
    expect(ean13CheckDigit('400638133393')).toBe(1);
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('4006381333932')).toBe(false);
  });
});

describe('품목 그림', () => {
  it('모양마다 SVG를 그린다', () => {
    for (const shape of ['box', 'bottle', 'can', 'pouch', 'tube', 'roll'] as const) {
      const svg = skuArtSvg({ shape, hue: 200, code: 'SOG-1' });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('SOG-1');
    }
  });
});
