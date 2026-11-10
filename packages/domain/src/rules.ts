/** 화면과 서버가 같은 답을 내야 하는 재고 규칙 */
import type {
  CountLine,
  CountTaskStatus,
  MovementType,
  OrderStatus,
  SkuCategory,
  ZoneCode,
} from './types';

export type StockStatus = 'ok' | 'low' | 'out';

export function available(onHand: number, reserved: number): number {
  return Math.max(0, onHand - reserved);
}

export function stockStatus(onHand: number, safetyStock: number): StockStatus {
  if (onHand <= 0) return 'out';
  if (onHand < safetyStock) return 'low';
  return 'ok';
}

/** 실사 차이. 아직 세지 않았으면 null */
export function variance(line: Pick<CountLine, 'countedQty' | 'expectedQty'>): number | null {
  return line.countedQty === null ? null : line.countedQty - line.expectedQty;
}

/**
 * 승인할 때 반영할 재고 수량.
 * 실사 수량은 센 시점의 진실이므로, 센 뒤에 일어난 이동(movedSinceCount)을 더합니다.
 */
export function settledOnHand(countedQty: number, movedSinceCount: number): number {
  return Math.max(0, countedQty + movedSinceCount);
}

/** 재고 정확도: 차이가 없는 줄의 비율(%) */
export function accuracyRate(
  lines: Pick<CountLine, 'countedQty' | 'expectedQty'>[],
): number | null {
  const counted = lines.filter((line) => line.countedQty !== null);
  if (counted.length === 0) return null;
  const exact = counted.filter((line) => variance(line) === 0).length;
  return Math.round((exact / counted.length) * 1000) / 10;
}

/** 이동 한 건이 특정 재고(로케이션)에 주는 증감 */
export function movementEffect(
  movement: {
    type: MovementType;
    fromLocationId: string | null;
    toLocationId: string | null;
    qty: number;
    delta: number;
  },
  locationId: string,
): number {
  switch (movement.type) {
    case 'receipt':
      return movement.toLocationId === locationId ? movement.qty : 0;
    case 'shipment':
      return movement.fromLocationId === locationId ? -movement.qty : 0;
    case 'transfer':
      return (
        (movement.toLocationId === locationId ? movement.qty : 0) -
        (movement.fromLocationId === locationId ? movement.qty : 0)
      );
    case 'adjustment':
    case 'count':
      return movement.toLocationId === locationId || movement.fromLocationId === locationId
        ? movement.delta
        : 0;
  }
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  ok: '정상',
  low: '부족',
  out: '품절',
};

export const CATEGORY_LABEL: Record<SkuCategory, string> = {
  electronics: '전자부품',
  packaging: '포장재',
  tools: '공구',
  household: '생활용품',
  food: '상온식품',
  apparel: '의류잡화',
};

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  receipt: '입고',
  shipment: '출고',
  transfer: '이동',
  adjustment: '조정',
  count: '실사 반영',
};

export const COUNT_STATUS_LABEL: Record<CountTaskStatus, string> = {
  open: '대기',
  in_progress: '진행 중',
  submitted: '검토 대기',
  approved: '승인',
  cancelled: '취소',
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  reserved: '피킹 대기',
  picking: '피킹 중',
  picked: '출고 대기',
  shipped: '출고 완료',
  cancelled: '취소',
};

/**
 * 가용 재고에서 수량을 예약할 로케이션을 고릅니다. 가용 재고가 많은 곳부터 채워 피킹할 곳 수를 줄입니다.
 * 모자라면 null을 돌려줍니다.
 */
export function allocate<T extends { id: string; onHand: number; reserved: number }>(
  stocks: T[],
  qty: number,
): { stock: T; qty: number }[] | null {
  const sorted = [...stocks]
    .map((stock) => ({ stock, free: available(stock.onHand, stock.reserved) }))
    .filter((item) => item.free > 0)
    .sort((a, b) => b.free - a.free || a.stock.id.localeCompare(b.stock.id));
  const picks: { stock: T; qty: number }[] = [];
  let left = qty;
  for (const { stock, free } of sorted) {
    if (left <= 0) break;
    const take = Math.min(free, left);
    picks.push({ stock, qty: take });
    left -= take;
  }
  return left > 0 ? null : picks;
}

export const ZONE_LABEL: Record<ZoneCode, string> = {
  A: 'A 상온 랙',
  B: 'B 냉장',
  C: 'C 대형 팔레트',
  D: 'D 출고 대기',
};

const won = new Intl.NumberFormat('ko-KR');

export function formatNumber(value: number): string {
  return won.format(value);
}

export function formatWon(value: number): string {
  return `${won.format(Math.round(value))}원`;
}

/** +3, -2, 0 */
export function formatDelta(value: number): string {
  if (value > 0) return `+${won.format(value)}`;
  if (value < 0) return `−${won.format(Math.abs(value))}`;
  return '0';
}

/** EAN-13 검사 숫자 */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}
