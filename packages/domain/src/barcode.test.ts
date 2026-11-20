import { describe, expect, it } from 'vitest';
import { barRuns, EAN13_MODULES, ean13Modules, isGuardModule } from './barcode';
import { ean13CheckDigit } from './rules';

/** 시험용 해독기: 왼쪽 패턴(L/G)으로 첫 자리를, R 패턴으로 오른쪽을 되찾습니다. */
const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const R = L.map((c) => [...c].map((b) => (b === '1' ? '0' : '1')).join(''));
const G = R.map((c) => [...c].reverse().join(''));
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

function decode(modules: string): string {
  let parity = '';
  let left = '';
  for (let i = 0; i < 6; i++) {
    const chunk = modules.slice(3 + i * 7, 10 + i * 7);
    const l = L.indexOf(chunk);
    const g = G.indexOf(chunk);
    parity += l >= 0 ? 'L' : 'G';
    left += String(l >= 0 ? l : g);
  }
  let right = '';
  for (let i = 0; i < 6; i++) right += String(R.indexOf(modules.slice(50 + i * 7, 57 + i * 7)));
  return `${PARITY.indexOf(parity)}${left}${right}`;
}

describe('EAN-13 막대', () => {
  it('모두 0인 코드는 L 패턴 여섯과 R 패턴 여섯, 세 가드로 95모듈이다', () => {
    expect(ean13Modules('0000000000000')).toBe(
      `101${'0001101'.repeat(6)}01010${'1110010'.repeat(6)}101`,
    );
  });

  it('시드의 품목 바코드와 임의의 코드를 막대로 바꿨다가 다시 읽으면 같은 숫자다', () => {
    // 시드의 첫 품목(880 + 일련번호 010201 + 순번 000)과 널리 알려진 예시 두 개
    const codes = [
      '880010201000' + ean13CheckDigit('880010201000'),
      '4006381333931',
      '5901234123457',
    ];
    for (let n = 0; n < 200; n++) {
      const first12 = String(Math.floor(Math.random() * 1e12)).padStart(12, '0');
      codes.push(first12 + ean13CheckDigit(first12));
    }
    for (const code of codes) {
      const modules = ean13Modules(code)!;
      expect(modules).toHaveLength(EAN13_MODULES);
      expect(decode(modules)).toBe(code);
    }
  });

  it('검증 숫자가 틀렸거나 13자리가 아니면 null이다', () => {
    expect(ean13Modules('8800102010001')).toBeNull();
    expect(ean13Modules('880010201000')).toBeNull();
    expect(ean13Modules('88001020100A9')).toBeNull();
  });

  it('이어진 막대를 묶고, 가드 위치를 알려 준다', () => {
    expect(barRuns('1011001110')).toEqual([
      [0, 1],
      [2, 2],
      [6, 3],
    ]);
    expect([0, 2, 3, 45, 49, 50, 92, 94].map(isGuardModule)).toEqual([
      true,
      true,
      false,
      true,
      true,
      false,
      true,
      true,
    ]);
  });
});
