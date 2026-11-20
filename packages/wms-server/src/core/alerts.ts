/**
 * 안전 재고 알림: 쓰기 하나로 품목 상태가 나빠지면(정상 → 부족·품절, 부족 → 품절) 알립니다.
 * 출고 확정, 입출고, 재고 조정, 실사 승인처럼 재고를 줄이는 쓰기와, 안전 재고를 올린 품목 수정이 모두 대상입니다.
 * 상태는 품목의 모든 로케이션 재고 합(보유)과 안전 재고로 정합니다(`stockStatus`).
 */
import { stockStatus, type Sku, type StockLevel, type StockStatus } from '@sog/domain';
import type { WriteOp } from '../idb';

export interface StockAlert {
  skuId: string;
  kind: 'stock.low' | 'stock.out';
  message: string;
}

/** 상태가 나쁜 순서. 이 값이 커지면 알립니다. */
export const STATUS_RANK: Record<StockStatus, number> = { ok: 0, low: 1, out: 2 };

/** 알림 문구(서버와 시드가 같이 씀) */
export function alertMessage(
  status: 'low' | 'out',
  sku: Pick<Sku, 'name' | 'unit' | 'safetyStock'>,
  onHand: number,
): string {
  return status === 'out'
    ? `${sku.name} 재고가 모두 떨어졌습니다(품절, 안전 재고 ${sku.safetyStock}${sku.unit}).`
    : `${sku.name} 재고가 안전 재고 아래로 떨어졌습니다(보유 ${onHand}${sku.unit} · 안전 재고 ${sku.safetyStock}${sku.unit}).`;
}

/** 이번 쓰기(ops)가 바꾼 품목마다 쓰기 전(stocks, skus)과 뒤의 상태를 비교합니다. */
export function stockAlerts(
  ops: readonly WriteOp[],
  stocks: readonly StockLevel[],
  skus: readonly Sku[],
): StockAlert[] {
  const nextStocks = new Map<string, StockLevel>();
  const nextSkus = new Map<string, Sku>();
  for (const op of ops) {
    if (!('put' in op)) continue;
    if (op.store === 'stocks') nextStocks.set(op.put.id, op.put as StockLevel);
    else if (op.store === 'skus') nextSkus.set(op.put.id, op.put as Sku);
  }
  const touched = new Set([
    ...[...nextStocks.values()].map((stock) => stock.skuId),
    ...nextSkus.keys(),
  ]);
  const alerts: StockAlert[] = [];
  for (const skuId of touched) {
    const before = skus.find((sku) => sku.id === skuId);
    const after = nextSkus.get(skuId) ?? before;
    if (!before || !after) continue;
    const own = stocks.filter((stock) => stock.skuId === skuId);
    const onHandBefore = own.reduce((sum, stock) => sum + stock.onHand, 0);
    const onHandAfter =
      own.reduce((sum, stock) => sum + (nextStocks.get(stock.id) ?? stock).onHand, 0) +
      [...nextStocks.values()]
        .filter((stock) => stock.skuId === skuId && !own.some((s) => s.id === stock.id))
        .reduce((sum, stock) => sum + stock.onHand, 0);
    const was = stockStatus(onHandBefore, before.safetyStock);
    const now = stockStatus(onHandAfter, after.safetyStock);
    if (now === 'ok' || STATUS_RANK[now] <= STATUS_RANK[was]) continue;
    alerts.push({
      skuId,
      kind: now === 'out' ? 'stock.out' : 'stock.low',
      message: alertMessage(now, after, onHandAfter),
    });
  }
  return alerts;
}
