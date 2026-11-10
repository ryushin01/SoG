/** 데모 데이터. 고정 시드 난수로 만들어 언제 초기화해도 같은 구성이 나옵니다. 시각만 초기화 시점을 기준으로 합니다. */
import {
  ean13CheckDigit,
  type Activity,
  type CountLine,
  type CountTask,
  type Location,
  type Movement,
  type Sku,
  type SkuCategory,
  type SkuShape,
  type StockLevel,
  type User,
  type Zone,
  type ZoneCode,
} from '@sog/domain';

export interface SeedData {
  users: User[];
  locations: Location[];
  skus: Sku[];
  stocks: StockLevel[];
  movements: Movement[];
  counts: CountTask[];
  countLines: CountLine[];
  activity: Activity[];
}

export const ZONES: Zone[] = [
  { code: 'A', name: 'A 상온 랙', condition: '상온 15~25℃' },
  { code: 'B', name: 'B 냉장', condition: '냉장 2~8℃' },
  { code: 'C', name: 'C 대형 팔레트', condition: '상온, 지게차 구역' },
  { code: 'D', name: 'D 출고 대기', condition: '상온, 출고 검수' },
];

export const USERS: User[] = [
  { id: 'u-kim', name: '김하늘', role: 'manager', team: '재고관리팀' },
  { id: 'u-park', name: '박도윤', role: 'manager', team: '센터장' },
  { id: 'u-lee', name: '이서준', role: 'operator', team: '실사 1조' },
  { id: 'u-choi', name: '최민아', role: 'operator', team: '실사 1조' },
  { id: 'u-jung', name: '정우진', role: 'operator', team: '실사 2조' },
];

type Spec = [name: string, shape: SkuShape, unit: string, cost: number];

const CATALOG: Record<SkuCategory, { hue: number; zones: ZoneCode[]; items: Spec[] }> = {
  electronics: {
    hue: 205,
    zones: ['A'],
    items: [
      ['산업용 USB-C 케이블 1m', 'pouch', 'EA', 4800],
      ['리튬 배터리팩 18650 4구', 'box', 'EA', 23500],
      ['DIN 레일 단자대 10P', 'box', 'EA', 6200],
      ['근접 센서 M12 PNP', 'box', 'EA', 18900],
      ['LED 표시등 24V 적색', 'tube', 'EA', 3400],
      ['알루미늄 방열판 40mm', 'box', 'EA', 2100],
      ['릴레이 모듈 4채널', 'box', 'EA', 9700],
      ['열수축 튜브 세트', 'tube', 'SET', 7600],
    ],
  },
  packaging: {
    hue: 32,
    zones: ['C', 'A'],
    items: [
      ['골판지 박스 3호', 'box', 'BOX', 650],
      ['에어캡 롤 50m', 'roll', 'ROLL', 12800],
      ['OPP 테이프 48mm', 'roll', 'ROLL', 1100],
      ['완충 에어백 20입', 'pouch', 'PACK', 5400],
      ['스트레치 필름 500mm', 'roll', 'ROLL', 15900],
      ['지퍼백 대형 100매', 'pouch', 'PACK', 6900],
      ['라벨 용지 A4 100매', 'box', 'BOX', 11200],
      ['종이 완충재 롤', 'roll', 'ROLL', 21000],
    ],
  },
  tools: {
    hue: 12,
    zones: ['A', 'C'],
    items: [
      ['전동 드릴 비트 세트', 'box', 'SET', 28900],
      ['육각 렌치 세트 9종', 'box', 'SET', 13400],
      ['절연 장갑 L', 'pouch', 'PAIR', 8800],
      ['케이블 타이 300mm', 'pouch', 'PACK', 3900],
      ['실리콘 실런트 투명', 'tube', 'EA', 4600],
      ['방청 윤활제 420ml', 'can', 'EA', 7200],
      ['작업용 커터칼 18mm', 'box', 'EA', 2900],
      ['마스킹 테이프 24mm', 'roll', 'ROLL', 1500],
    ],
  },
  household: {
    hue: 168,
    zones: ['A'],
    items: [
      ['주방세제 리필 1.2L', 'pouch', 'EA', 4200],
      ['섬유유연제 2.5L', 'bottle', 'EA', 9800],
      ['물티슈 캡형 100매', 'pouch', 'EA', 2300],
      ['핸드워시 500ml', 'bottle', 'EA', 5600],
      ['키친타월 6롤', 'roll', 'PACK', 7400],
      ['다목적 세정제 750ml', 'bottle', 'EA', 4900],
      ['고무장갑 중형', 'pouch', 'PAIR', 1800],
      ['종이컵 1000개', 'box', 'BOX', 19500],
    ],
  },
  food: {
    hue: 88,
    zones: ['B', 'A'],
    items: [
      ['유기농 귀리 1kg', 'pouch', 'EA', 8900],
      ['토마토 소스 680g', 'can', 'EA', 4300],
      ['엑스트라버진 올리브유 500ml', 'bottle', 'EA', 12900],
      ['참치 통조림 150g', 'can', 'EA', 2400],
      ['그래놀라 500g', 'pouch', 'EA', 7900],
      ['탄산수 레몬 500ml', 'bottle', 'EA', 900],
      ['콘 통조림 340g', 'can', 'EA', 1900],
      ['아카시아 꿀 1kg', 'bottle', 'EA', 24800],
    ],
  },
  apparel: {
    hue: 248,
    zones: ['A', 'D'],
    items: [
      ['작업복 상의 L', 'box', 'EA', 32000],
      ['경량 안전화 270', 'box', 'PAIR', 54000],
      ['방한 장갑', 'pouch', 'PAIR', 6900],
      ['면 양말 3족', 'pouch', 'PACK', 5900],
      ['고시인성 반사 조끼', 'pouch', 'EA', 8400],
      ['니트 비니', 'pouch', 'EA', 7800],
      ['우비 판초', 'pouch', 'EA', 4500],
      ['쿨 토시 한 쌍', 'pouch', 'PAIR', 3200],
    ],
  },
};

const DESCRIPTIONS: Record<SkuCategory, string> = {
  electronics: '정전기 방지 포장 상태로 보관합니다. 습도가 높은 구역을 피해 주세요.',
  packaging: '출고 포장에 쓰는 소모품입니다. 낱개가 아닌 묶음 단위로 셉니다.',
  tools: '현장 작업자에게 지급하는 공구·소모품입니다. 지급 시 출고로 처리합니다.',
  household: '생활용품 고객사의 위탁 재고입니다. 액체류는 하단 랙에 둡니다.',
  food: '식품 고객사의 위탁 재고입니다. 유통기한 선입선출(FEFO)로 출고합니다.',
  apparel: '사이즈별로 따로 관리합니다. 포장을 뜯은 상품은 별도 로케이션으로 옮깁니다.',
};

/** mulberry32 */
function random(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n: number, size = 2): string {
  return String(n).padStart(size, '0');
}

export function buildLocations(): Location[] {
  const layout: Record<ZoneCode, [aisles: number, racks: number, levels: number]> = {
    A: [3, 4, 2],
    B: [1, 4, 2],
    C: [2, 3, 1],
    D: [1, 4, 1],
  };
  const locations: Location[] = [];
  for (const [zone, [aisles, racks, levels]] of Object.entries(layout) as [
    ZoneCode,
    [number, number, number],
  ][]) {
    for (let aisle = 1; aisle <= aisles; aisle++) {
      for (let rack = 1; rack <= racks; rack++) {
        for (let level = 1; level <= levels; level++) {
          const code = `${zone}-${pad(aisle)}-${pad(rack)}-${level}`;
          locations.push({ id: `loc-${code}`, code, zone, aisle, rack, level });
        }
      }
    }
  }
  return locations;
}

export function createSeed(now: Date): SeedData {
  const rand = random(20261110);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const ago = (days: number, hours = 0) =>
    new Date(now.getTime() - (days * 24 + hours) * 3_600_000).toISOString();
  const yymm = `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}`;

  const locations = buildLocations();
  const byZone = (zone: ZoneCode) => locations.filter((location) => location.zone === zone);

  const skus: Sku[] = [];
  const stocks: StockLevel[] = [];
  let serial = 10201;
  for (const [category, group] of Object.entries(CATALOG) as [
    SkuCategory,
    (typeof CATALOG)[SkuCategory],
  ][]) {
    group.items.forEach(([name, shape, unit, cost], index) => {
      const id = `sku-${serial}`;
      const first12 = `880${pad(serial, 6)}${pad(index, 3)}`;
      const safetyStock = pick([10, 20, 30, 40, 60]);
      const updatedAt = ago(int(1, 40), int(0, 23));
      skus.push({
        id,
        code: `SOG-${serial}`,
        barcode: `${first12}${ean13CheckDigit(first12)}`,
        name,
        category,
        unit,
        unitCost: cost,
        safetyStock,
        weight: int(40, 2400),
        dimensions: [int(40, 420), int(30, 380), int(20, 300)],
        shape,
        hue: group.hue + int(-14, 14),
        description: DESCRIPTIONS[category],
        version: 1,
        updatedAt,
        updatedBy: 'u-kim',
      });

      // 1~3곳에 나눠 보관. 일부 품목은 일부러 부족·품절로 둡니다.
      const spread = int(1, 3);
      const used = new Set<string>();
      for (let i = 0; i < spread; i++) {
        const zone = i === 0 ? group.zones[0]! : pick(group.zones);
        const location = pick(byZone(zone));
        if (used.has(location.id)) continue;
        used.add(location.id);
        const scarce = rand() < 0.14;
        const onHand = scarce
          ? int(0, Math.max(1, Math.floor(safetyStock / 3)))
          : int(safetyStock, safetyStock * 6);
        stocks.push({
          id: `st-${id}-${location.code}`,
          skuId: id,
          locationId: location.id,
          onHand,
          reserved: onHand > 8 && rand() < 0.3 ? int(1, Math.floor(onHand / 4)) : 0,
          version: 1,
          updatedAt,
          updatedBy: 'u-kim',
        });
      }
      serial += 7;
    });
  }

  // 최근 30일 입출고 기록
  const movements: Movement[] = [];
  let mv = 1;
  const workers = ['u-kim', 'u-park', 'u-jung'];
  for (let day = 30; day >= 1; day--) {
    const count = int(5, 11);
    for (let i = 0; i < count; i++) {
      const stock = pick(stocks);
      const type = rand() < 0.45 ? 'receipt' : rand() < 0.85 ? 'shipment' : 'transfer';
      const qty = int(2, 24);
      const target = locations.find((location) => location.id === stock.locationId)!;
      const other = pick(byZone(target.zone));
      movements.push({
        id: `mv-${pad(mv++, 5)}`,
        type,
        skuId: stock.skuId,
        fromLocationId: type === 'receipt' ? null : stock.locationId,
        toLocationId:
          type === 'shipment' ? null : type === 'transfer' ? other.id : stock.locationId,
        qty,
        delta: 0,
        reason:
          type === 'receipt'
            ? '정기 입고'
            : type === 'shipment'
              ? '고객사 출고'
              : '로케이션 재배치',
        ref:
          type === 'transfer'
            ? null
            : `${type === 'receipt' ? 'PO' : 'SO'}-${yymm}-${pad(int(1, 999), 4)}`,
        at: ago(day, int(0, 9)),
        by: pick(workers),
      });
    }
  }

  // 실사 작업
  const counts: CountTask[] = [];
  const countLines: CountLine[] = [];
  const activity: Activity[] = [];
  const zoneStocks = (zone: ZoneCode, aisle?: number) =>
    stocks.filter((stock) => {
      const location = locations.find((l) => l.id === stock.locationId)!;
      return location.zone === zone && (aisle === undefined || location.aisle === aisle);
    });

  const makeTask = (
    n: number,
    title: string,
    zone: ZoneCode,
    aisle: number | undefined,
    assigneeId: string,
    status: CountTask['status'],
    blind: boolean,
    createdDaysAgo: number,
    dueInDays: number,
    countedRatio: number,
  ) => {
    const id = `ct-${pad(n, 3)}`;
    const createdAt = ago(createdDaysAgo, 2);
    const task: CountTask = {
      id,
      code: `CC-${yymm}-${pad(n, 3)}`,
      title,
      zone,
      assigneeId,
      status,
      blind,
      dueAt: new Date(now.getTime() + dueInDays * 86_400_000).toISOString(),
      createdAt,
      createdBy: 'u-kim',
      submittedAt:
        status === 'submitted' || status === 'approved'
          ? ago(Math.max(0, createdDaysAgo - 1))
          : null,
      approvedAt: status === 'approved' ? ago(Math.max(0, createdDaysAgo - 2)) : null,
      version: 1,
      updatedAt: createdAt,
      updatedBy: 'u-kim',
    };
    counts.push(task);
    activity.push({
      id: `ac-${id}-c`,
      kind: 'count.created',
      message: `실사 작업 ${task.code}을(를) 만들었습니다.`,
      at: createdAt,
      by: 'u-kim',
      target: `/counts/${id}`,
    });
    zoneStocks(zone, aisle).forEach((stock, index) => {
      const counted = index / Math.max(1, zoneStocks(zone, aisle).length) < countedRatio;
      const off = rand() < 0.22 ? pick([-3, -2, -1, 1, 2]) : 0;
      const countedQty = counted ? Math.max(0, stock.onHand + off) : null;
      countLines.push({
        id: `cl-${id}-${pad(index, 3)}`,
        taskId: id,
        skuId: stock.skuId,
        locationId: stock.locationId,
        stockId: stock.id,
        expectedQty: stock.onHand,
        snapshotVersion: stock.version,
        snapshotAt: createdAt,
        countedQty,
        countedAt: counted ? ago(Math.max(0, createdDaysAgo - 1), int(1, 6)) : null,
        countedBy: counted ? assigneeId : null,
        status: counted ? 'counted' : 'pending',
        note:
          off !== 0 && counted
            ? pick(['파손품 1개 따로 보관', '라벨 불일치', '옆 칸에 섞여 있음', ''])
            : '',
        version: counted ? 2 : 1,
        updatedAt: createdAt,
        updatedBy: assigneeId,
      });
    });
  };

  makeTask(1, 'A구역 1통로 정기 실사', 'A', 1, 'u-jung', 'approved', false, 9, -6, 1);
  makeTask(2, '냉장 구역 월말 실사', 'B', undefined, 'u-choi', 'submitted', true, 3, 1, 1);
  makeTask(3, 'A구역 2통로 순환 실사', 'A', 2, 'u-lee', 'in_progress', true, 1, 1, 0.45);
  makeTask(4, '대형 팔레트 구역 실사', 'C', undefined, 'u-lee', 'open', false, 0, 2, 0);
  makeTask(5, 'A구역 3통로 순환 실사', 'A', 3, 'u-choi', 'open', true, 0, 3, 0);

  // 승인된 실사는 이미 재고에 반영된 것으로 맞춥니다.
  for (const line of countLines.filter((l) => l.taskId === 'ct-001' && l.countedQty !== null)) {
    const delta = line.countedQty! - line.expectedQty;
    if (delta === 0) continue;
    const stock = stocks.find((s) => s.id === line.stockId)!;
    stock.onHand = line.countedQty!;
    stock.version += 1;
    movements.push({
      id: `mv-${pad(mv++, 5)}`,
      type: 'count',
      skuId: line.skuId,
      fromLocationId: null,
      toLocationId: line.locationId,
      qty: Math.abs(delta),
      delta,
      reason: '실사 차이 반영',
      ref: 'CC-' + yymm + '-001',
      at: ago(7),
      by: 'u-kim',
    });
  }
  // 이후 작업의 장부 수량도 현재 재고와 맞춥니다.
  for (const line of countLines.filter((l) => l.taskId !== 'ct-001')) {
    const stock = stocks.find((s) => s.id === line.stockId)!;
    line.expectedQty = stock.onHand;
    line.snapshotVersion = stock.version;
    if (line.countedQty !== null && line.taskId !== 'ct-002') {
      line.countedQty = Math.max(0, stock.onHand + (rand() < 0.2 ? pick([-2, -1, 1]) : 0));
    }
  }

  // 검토 대기 작업에는 차이를 몇 건 넣어 검토 화면에서 바로 볼 수 있게 합니다.
  const forced = [-3, 0, 2, 0, -1, 0, -5];
  countLines
    .filter((line) => line.taskId === 'ct-002')
    .forEach((line, index) => {
      const off = forced[index % forced.length]!;
      line.countedQty = Math.max(0, line.expectedQty + off);
      line.note =
        off < 0 ? (index === 0 ? '파손품 따로 보관' : '') : off > 0 ? '옆 칸에 섞여 있음' : '';
    });

  movements.sort((a, b) => a.at.localeCompare(b.at));
  for (const movement of movements.slice(-24)) {
    activity.push({
      id: `ac-${movement.id}`,
      kind: 'movement',
      message: describeMovementSeed(movement, skus, locations),
      at: movement.at,
      by: movement.by,
      target: `/inventory/${movement.skuId}`,
    });
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  return { users: USERS, locations, skus, stocks, movements, counts, countLines, activity };
}

function describeMovementSeed(movement: Movement, skus: Sku[], locations: Location[]): string {
  const sku = skus.find((s) => s.id === movement.skuId)!;
  const code = (id: string | null) => locations.find((l) => l.id === id)?.code ?? '';
  switch (movement.type) {
    case 'receipt':
      return `${sku.name} ${movement.qty}${sku.unit} 입고 → ${code(movement.toLocationId)}`;
    case 'shipment':
      return `${sku.name} ${movement.qty}${sku.unit} 출고 ← ${code(movement.fromLocationId)}`;
    case 'transfer':
      return `${sku.name} ${movement.qty}${sku.unit} 이동 ${code(movement.fromLocationId)} → ${code(movement.toLocationId)}`;
    default:
      return `${sku.name} 실사 차이 ${movement.delta > 0 ? '+' : ''}${movement.delta}${sku.unit} 반영`;
  }
}
