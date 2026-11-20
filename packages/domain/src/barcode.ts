/**
 * EAN-13 바코드를 막대로 바꿉니다(라벨 인쇄). 이미지 파일 없이 화면이 SVG로 그리고, 현장 앱 카메라 스캔
 * (BarcodeDetector)과 산업용 스캐너가 그대로 읽습니다.
 *
 * 구조(95모듈): 시작 가드 101 · 왼쪽 6자리(첫 자리에 따라 L/G 패턴) · 가운데 가드 01010 · 오른쪽 6자리(R 패턴)
 * · 끝 가드 101. 한 모듈은 막대(1) 또는 빈칸(0) 한 칸입니다.
 */
import { isValidEan13 } from './rules';

/** 왼쪽 숫자의 L 패턴(홀수 패리티). R은 L을 뒤집은 값, G는 R을 거꾸로 읽은 값입니다. */
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
] as const;
const R = L.map((code) => [...code].map((bit) => (bit === '1' ? '0' : '1')).join(''));
const G = R.map((code) => [...code].reverse().join(''));

/** 첫 자리에 따라 왼쪽 6자리에 쓰는 패턴(L·G). 첫 자리는 막대로 그리지 않고 이 조합으로 나타납니다. */
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
] as const;

/** 막대 모듈 수(가드 포함) */
export const EAN13_MODULES = 95;

/** 13자리 EAN-13(검증 숫자까지 맞는 값)을 95모듈 문자열('1' 막대, '0' 빈칸)로 바꿉니다. 맞지 않으면 null. */
export function ean13Modules(code: string): string | null {
  if (!isValidEan13(code)) return null;
  const digits = [...code].map(Number);
  const parity = PARITY[digits[0]!]!;
  let left = '';
  for (let i = 1; i <= 6; i++) {
    left += (parity[i - 1] === 'L' ? L : G)[digits[i]!];
  }
  let right = '';
  for (let i = 7; i <= 12; i++) right += R[digits[i]!];
  return `101${left}01010${right}101`;
}

/** 이어진 막대(1)를 [시작 모듈, 너비]로 묶습니다. SVG의 rect 하나가 막대 하나입니다. */
export function barRuns(modules: string): [start: number, width: number][] {
  const runs: [number, number][] = [];
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] !== '1') continue;
    let j = i;
    while (modules[j + 1] === '1') j++;
    runs.push([i, j - i + 1]);
    i = j;
  }
  return runs;
}

/** 가드 막대(시작·가운데·끝)인지. 가드는 숫자 막대보다 길게 그립니다. */
export function isGuardModule(index: number): boolean {
  return index < 3 || (index >= 45 && index < 50) || index >= 92;
}
