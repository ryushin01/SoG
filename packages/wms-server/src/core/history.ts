/** 변경 이력: 남길 필드, 이전·이후 비교, 버전 충돌로 막힌 시도 */
import type { HistoryChange, HistoryEntry, HistoryKind, SkuDetail, User } from '@sog/domain';
import { row } from './http';

/** 변경 이력에 남길 필드와 화면 이름 */
export const TRACKED: Record<HistoryKind, Record<string, string>> = {
  sku: { name: '품목명', safetyStock: '안전 재고', unitCost: '단가', description: '설명' },
  stock: { onHand: '보유', reserved: '출고 지시' },
  countLine: { countedQty: '센 수량', note: '메모', status: '상태' },
};

/** 변경 이력을 남기는 저장소와 이력 종류 */
export const STORE_KIND: Partial<Record<string, HistoryKind>> = {
  skus: 'sku',
  stocks: 'stock',
  countLines: 'countLine',
};

export function diff(
  kind: HistoryKind,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
): HistoryChange[] {
  return Object.entries(TRACKED[kind])
    .filter(([field]) => (before?.[field] ?? null) !== (after[field] ?? null))
    .map(([field, label]) => ({
      field,
      label,
      before: (before?.[field] ?? null) as string | number | null,
      after: (after[field] ?? null) as string | number | null,
    }));
}

/** 412로 막힌 시도를 이력으로 남깁니다. 품목 정보 수정과 재고 조정만 시도한 값을 알 수 있습니다. */
export function blockedHistory(
  newId: (prefix: string) => string,
  path: string,
  body: unknown,
  current: unknown,
  sentVersion: string | null,
  user: User,
  at: string,
): { id: string } | null {
  const version = Number((sentVersion ?? '').replaceAll('"', ''));
  const attempt = (body ?? {}) as Record<string, unknown>;
  const skuMatch = /^\/api\/skus\/([^/]+)$/.exec(path);
  if (skuMatch && current && typeof current === 'object' && 'sku' in current) {
    const latest = (current as SkuDetail).sku as unknown as Record<string, unknown>;
    const changes = diff('sku', latest, { ...latest, ...attempt });
    if (changes.length === 0) return null;
    return row<HistoryEntry>({
      id: newId('hi'),
      kind: 'sku',
      docId: skuMatch[1]!,
      skuId: skuMatch[1]!,
      version,
      at,
      by: user.id,
      reason: `${user.name}님의 수정이 버전 충돌로 막혔습니다.`,
      locationCode: null,
      changes,
      blocked: true,
    });
  }
  const stockMatch = /^\/api\/stocks\/([^/]+)\/adjust$/.exec(path);
  if (stockMatch && current && typeof current === 'object' && 'stocks' in current) {
    const detail = current as SkuDetail;
    const stock = detail.stocks.find((s) => s.id === stockMatch[1]);
    if (!stock || typeof attempt['onHand'] !== 'number') return null;
    return row<HistoryEntry>({
      id: newId('hi'),
      kind: 'stock',
      docId: stock.id,
      skuId: stock.skuId,
      version,
      at,
      by: user.id,
      reason: `${user.name}님의 재고 조정이 버전 충돌로 막혔습니다.`,
      locationCode: stock.location.code,
      changes: [
        {
          field: 'onHand',
          label: '보유',
          before: stock.onHand,
          after: attempt['onHand'] as number,
        },
      ],
      blocked: true,
    });
  }
  return null;
}
