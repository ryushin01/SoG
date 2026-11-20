/** 데모 데이터. 고정 시드 난수로 만들어 언제 초기화해도 같은 구성이 나옵니다. 시각만 초기화 시점을 기준으로 합니다. */
import {
  allocate,
  ean13CheckDigit,
  type Activity,
  type CountLine,
  type CountTask,
  type HistoryEntry,
  type Location,
  type Movement,
  type MovementType,
  type ShipmentOrder,
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
  orders: ShipmentOrder[];
  history: HistoryEntry[];
  activity: Activity[];
}

export const ZONES: Zone[] = [
  { code: 'A', name: 'A 상온 랙', condition: '상온 15~25℃' },
  { code: 'B', name: 'B 냉장', condition: '냉장 2~8℃' },
  { code: 'C', name: 'C 대형 팔레트', condition: '상온, 지게차 구역' },
  { code: 'D', name: 'D 출고 대기', condition: '상온, 출고 검수' },
  { code: 'E', name: 'E 냉동', condition: '냉동 영하 18℃ 이하' },
  { code: 'F', name: 'F 소형 피킹', condition: '상온, 자주 나가는 소형품 선반' },
];

/** 관리자는 백오피스, 작업자는 현장 앱으로 로그인합니다. 입출고 기록은 관리자만 남깁니다(서버 권한과 같음). */
export const USERS: User[] = [
  { id: 'u-kim', name: '김하늘', role: 'manager', team: '재고관리팀' },
  { id: 'u-park', name: '박도윤', role: 'manager', team: '센터장' },
  { id: 'u-seo', name: '서예린', role: 'manager', team: '입고관리팀' },
  { id: 'u-lee', name: '이서준', role: 'operator', team: '실사 1조' },
  { id: 'u-choi', name: '최민아', role: 'operator', team: '실사 1조' },
  { id: 'u-jung', name: '정우진', role: 'operator', team: '실사 2조' },
  { id: 'u-han', name: '한지우', role: 'operator', team: '실사 2조' },
  { id: 'u-yoon', name: '윤서연', role: 'operator', team: '출고 1조' },
  { id: 'u-kang', name: '강민재', role: 'operator', team: '출고 1조' },
];

type Spec = [name: string, shape: SkuShape, unit: string, cost: number];

/** 분류마다 12개. 첫 구역이 주 보관 구역이고, 나머지는 나눠 둘 때 고르는 구역입니다. */
const CATALOG: Record<SkuCategory, { hue: number; zones: ZoneCode[]; items: Spec[] }> = {
  electronics: {
    hue: 205,
    zones: ['A', 'F'],
    items: [
      ['산업용 USB-C 케이블 1m', 'pouch', 'EA', 4800],
      ['리튬 배터리팩 18650 4구', 'box', 'EA', 23500],
      ['DIN 레일 단자대 10P', 'box', 'EA', 6200],
      ['근접 센서 M12 PNP', 'box', 'EA', 18900],
      ['LED 표시등 24V 적색', 'tube', 'EA', 3400],
      ['알루미늄 방열판 40mm', 'box', 'EA', 2100],
      ['릴레이 모듈 4채널', 'box', 'EA', 9700],
      ['열수축 튜브 세트', 'tube', 'SET', 7600],
      ['SMPS 전원 공급기 24V 5A', 'box', 'EA', 32500],
      ['온도 센서 PT100 프로브', 'tube', 'EA', 15800],
      ['랜 케이블 CAT6 5m', 'pouch', 'EA', 6900],
      ['유리관 퓨즈 세트', 'box', 'SET', 8400],
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
      ['택배 봉투 대형 100매', 'pouch', 'PACK', 13500],
      ['스티로폼 아이스박스 10L', 'box', 'EA', 3200],
      ['아이스팩 젤 500g', 'pouch', 'EA', 450],
      ['PP 밴드 15mm', 'roll', 'ROLL', 18900],
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
      ['디지털 캘리퍼스 150mm', 'box', 'EA', 26500],
      ['충전식 전동 드라이버', 'box', 'EA', 79000],
      ['안전모 흰색', 'box', 'EA', 11800],
      ['방진 마스크 20입', 'box', 'BOX', 16500],
    ],
  },
  household: {
    hue: 168,
    zones: ['A', 'C'],
    items: [
      ['주방세제 리필 1.2L', 'pouch', 'EA', 4200],
      ['섬유유연제 2.5L', 'bottle', 'EA', 9800],
      ['물티슈 캡형 100매', 'pouch', 'EA', 2300],
      ['핸드워시 500ml', 'bottle', 'EA', 5600],
      ['키친타월 6롤', 'roll', 'PACK', 7400],
      ['다목적 세정제 750ml', 'bottle', 'EA', 4900],
      ['고무장갑 중형', 'pouch', 'PAIR', 1800],
      ['종이컵 1000개', 'box', 'BOX', 19500],
      ['세탁세제 캡슐 30입', 'pouch', 'PACK', 13900],
      ['쓰레기봉투 100L 50매', 'roll', 'ROLL', 8900],
      ['두루마리 화장지 30롤', 'roll', 'PACK', 18900],
      ['섬유 탈취제 400ml', 'bottle', 'EA', 5200],
    ],
  },
  food: {
    hue: 88,
    zones: ['A', 'C'],
    items: [
      ['유기농 귀리 1kg', 'pouch', 'EA', 8900],
      ['토마토 소스 680g', 'can', 'EA', 4300],
      ['엑스트라버진 올리브유 500ml', 'bottle', 'EA', 12900],
      ['참치 통조림 150g', 'can', 'EA', 2400],
      ['그래놀라 500g', 'pouch', 'EA', 7900],
      ['탄산수 레몬 500ml', 'bottle', 'EA', 900],
      ['콘 통조림 340g', 'can', 'EA', 1900],
      ['아카시아 꿀 1kg', 'bottle', 'EA', 24800],
      ['즉석밥 210g 12입', 'box', 'PACK', 11900],
      ['컵라면 6입', 'box', 'PACK', 6200],
      ['하루 견과 25g 30봉', 'pouch', 'PACK', 21900],
      ['원두커피 1kg', 'pouch', 'EA', 29000],
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
      ['기모 후드 집업 L', 'box', 'EA', 39000],
      ['작업 바지 32', 'box', 'EA', 29000],
      ['방수 장화 260', 'box', 'PAIR', 26000],
      ['플리스 넥워머', 'pouch', 'EA', 6500],
    ],
  },
  chilled: {
    hue: 140,
    zones: ['B'],
    items: [
      ['흰우유 1L', 'bottle', 'EA', 2900],
      ['그릭 요거트 450g', 'box', 'EA', 6900],
      ['포기김치 3kg', 'pouch', 'EA', 21900],
      ['부침 두부 300g', 'box', 'EA', 1900],
      ['슬라이스 치즈 20매', 'box', 'PACK', 7900],
      ['무염 버터 450g', 'box', 'EA', 11900],
      ['훈제 연어 200g', 'pouch', 'EA', 15900],
      ['생크림 500ml', 'bottle', 'EA', 6900],
      ['특란 30구', 'box', 'BOX', 8900],
      ['샐러드 채소 500g', 'pouch', 'EA', 5900],
      ['닭가슴살 1kg', 'pouch', 'EA', 12900],
      ['오렌지 주스 1.5L', 'bottle', 'EA', 5900],
    ],
  },
  frozen: {
    hue: 190,
    zones: ['E'],
    items: [
      ['고기만두 1.4kg', 'pouch', 'EA', 11900],
      ['손질 새우 900g', 'pouch', 'EA', 19900],
      ['바닐라 아이스크림 2L', 'box', 'EA', 9900],
      ['냉동 피자 400g', 'box', 'EA', 8900],
      ['감자튀김 2kg', 'pouch', 'EA', 9900],
      ['냉동 블루베리 1kg', 'pouch', 'EA', 13900],
      ['등심 돈까스 1.2kg', 'pouch', 'EA', 14900],
      ['새우 볶음밥 300g 5입', 'pouch', 'PACK', 12900],
      ['떡갈비 1kg', 'pouch', 'EA', 15900],
      ['냉동 망고 1kg', 'pouch', 'EA', 11900],
      ['치킨 너겟 1kg', 'pouch', 'EA', 10900],
      ['각얼음 3kg', 'pouch', 'EA', 3900],
    ],
  },
  beauty: {
    hue: 322,
    zones: ['F', 'A'],
    items: [
      ['선크림 SPF50 50ml', 'tube', 'EA', 18900],
      ['수분 크림 100ml', 'can', 'EA', 24900],
      ['약산성 샴푸 1L', 'bottle', 'EA', 13900],
      ['헤어 컨디셔너 1L', 'bottle', 'EA', 13900],
      ['바디워시 900ml', 'bottle', 'EA', 11900],
      ['클렌징 폼 150ml', 'tube', 'EA', 9900],
      ['시트 마스크 10매', 'pouch', 'PACK', 12000],
      ['무향 립밤', 'tube', 'EA', 4500],
      ['핸드크림 50ml', 'tube', 'EA', 6900],
      ['토너 패드 70매', 'can', 'EA', 19800],
      ['화장솜 200매', 'box', 'PACK', 3900],
      ['데오드란트 스프레이 150ml', 'can', 'EA', 8900],
    ],
  },
  pet: {
    hue: 52,
    zones: ['C', 'A'],
    items: [
      ['강아지 사료 6kg', 'pouch', 'EA', 42000],
      ['벤토나이트 고양이 모래 10L', 'pouch', 'EA', 15900],
      ['고양이 습식 캔 85g 24입', 'can', 'PACK', 26900],
      ['배변 패드 100매', 'pouch', 'PACK', 19900],
      ['반려견 육포 300g', 'pouch', 'EA', 12900],
      ['골판지 스크래쳐', 'box', 'EA', 9900],
      ['반려동물 탈취제 500ml', 'bottle', 'EA', 8900],
      ['덴탈 껌 30입', 'pouch', 'PACK', 14900],
      ['고양이 사료 2kg', 'pouch', 'EA', 24900],
      ['반려견 샴푸 500ml', 'bottle', 'EA', 11900],
      ['반려동물 물티슈 80매', 'pouch', 'EA', 3500],
      ['자동 급수기 2L', 'box', 'EA', 29900],
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
  chilled: '입고하면 바로 냉장 구역에 넣습니다. 유통기한 선입선출(FEFO)로 출고합니다.',
  frozen: '냉동 구역에만 둡니다. 출고 검수를 기다리는 동안에도 상온에 30분 넘게 두지 않습니다.',
  beauty: '화장품 고객사의 위탁 재고입니다. 제조번호(로트)별로 나눠 두고 직사광선을 피합니다.',
  pet: '반려동물 용품 고객사의 위탁 재고입니다. 사료·모래처럼 무거운 품목은 팔레트 아래쪽에 둡니다.',
};

/** 구역별 통로·랙·단 수. 창고 도면은 이 배치대로 그립니다. */
const LAYOUT: Record<ZoneCode, [aisles: number, racks: number, levels: number]> = {
  A: [4, 5, 3],
  B: [2, 4, 2],
  C: [4, 4, 1],
  D: [1, 6, 1],
  E: [1, 5, 2],
  F: [2, 4, 3],
};

type TaskSpec = [
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
];

/**
 * 실사 작업. 진행 중인 작업끼리는 겹치지 않는 구역·통로를 맡고, 출고 지시가 할당할 재고가 남도록
 * 구역 전체보다 통로 단위로 묶습니다(실사 중인 재고는 출고에 할당하지 않음).
 */
const TASKS: TaskSpec[] = [
  [1, 'A구역 1통로 정기 실사', 'A', 1, 'u-jung', 'approved', false, 9, -6, 1],
  [2, '냉장 1통로 월말 실사', 'B', 1, 'u-choi', 'submitted', true, 3, 1, 1],
  [3, 'A구역 2통로 순환 실사', 'A', 2, 'u-lee', 'in_progress', true, 1, 1, 0.45],
  [4, '대형 팔레트 1통로 실사', 'C', 1, 'u-lee', 'open', false, 0, 2, 0],
  [5, 'A구역 3통로 순환 실사', 'A', 3, 'u-choi', 'open', true, 0, 3, 0],
  [6, '냉동 구역 주간 실사', 'E', undefined, 'u-han', 'approved', false, 16, -13, 1],
  [7, '소형 피킹 1통로 실사', 'F', 1, 'u-han', 'in_progress', true, 1, 2, 0.3],
  [8, 'A구역 4통로 순환 실사', 'A', 4, 'u-jung', 'cancelled', true, 12, -9, 0.25],
  [9, '소형 피킹 2통로 실사', 'F', 2, 'u-lee', 'approved', false, 23, -20, 1],
  [10, '출고 대기 구역 마감 실사', 'D', undefined, 'u-choi', 'submitted', false, 2, 1, 1],
];

type OrderSpec = [
  n: number,
  customer: string,
  assigneeId: string,
  status: ShipmentOrder['status'],
  wants: [skuIndex: number, qty: number][],
  createdHoursAgo: number,
  dueInHours: number,
];

/**
 * 출고 지시. 품목 번호는 분류 순서대로 매긴 순번입니다(전자부품 0~11, 포장재 12~23, 공구 24~35,
 * 생활용품 36~47, 상온식품 48~59, 의류잡화 60~71, 냉장식품 72~83, 냉동식품 84~95, 화장품 96~107,
 * 반려용품 108~119).
 */
// prettier-ignore
const ORDERS: OrderSpec[] = [
  [1, '새솔상사', 'u-jung', 'shipped', [[8, 12], [24, 6]], 26, -20],
  [2, '한빛리테일', 'u-lee', 'picking', [[0, 8], [26, 4], [33, 10]], 3, 5],
  [3, '온누리마켓', 'u-jung', 'reserved', [[9, 20], [12, 6], [40, 3]], 1, 20],
  [4, '푸른마트', 'u-yoon', 'picked', [[36, 10], [41, 6], [50, 12]], 6, 4],
  [5, '바른유통', 'u-kang', 'shipped', [[14, 20], [18, 8]], 50, -30],
  [6, '다온상회', 'u-yoon', 'cancelled', [[62, 5], [66, 10]], 30, -6],
  [7, '고운식자재', 'u-kang', 'reserved', [[72, 10], [78, 6], [86, 8]], 2, 18],
  [8, '늘봄약국', 'u-yoon', 'reserved', [[96, 6], [101, 12], [105, 4]], 4, 28],
  [9, '멍냥스토어', 'u-kang', 'picking', [[108, 3], [110, 6], [113, 10]], 5, 3],
  [10, '새솔상사', 'u-jung', 'shipped', [[3, 4], [29, 10]], 98, -80],
  [11, '바른유통', 'u-lee', 'reserved', [[44, 6], [55, 12], [69, 2]], 1, 44],
  [12, '오늘캠핑', 'u-yoon', 'shipped', [[57, 8], [64, 4], [115, 6]], 22, -10],
];

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

function buildLocations(): Location[] {
  const locations: Location[] = [];
  for (const [zone, [aisles, racks, levels]] of Object.entries(LAYOUT) as [
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

const nameOf = (userId: string) => USERS.find((user) => user.id === userId)!.name;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const KST = 9 * HOUR;

export function createSeed(now: Date): SeedData {
  const rand = random(20261120);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const iso = (ms: number) => new Date(ms).toISOString();
  const ago = (days: number, hours = 0) => iso(now.getTime() - days * DAY - hours * HOUR);
  /** 며칠 전(한국 시간) 근무 시간의 시각. 오늘은 아직 오지 않은 시각일 수 있어 1일 전부터 씁니다. */
  const workday = (daysAgo: number, hour: number, minute = int(0, 59)) => {
    const today = Math.floor((now.getTime() + KST) / DAY) * DAY - KST;
    return iso(today - Math.max(1, daysAgo) * DAY + hour * HOUR + minute * 60_000);
  };
  const yymm = `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}`;
  /** 기록 날짜(한국 시간)의 연월. 지난달 입출고의 발주·수주 번호는 그달 번호로 붙습니다. */
  const monthOf = (at: string) => {
    const kst = new Date(Date.parse(at) + KST);
    return `${String(kst.getUTCFullYear()).slice(2)}${pad(kst.getUTCMonth() + 1)}`;
  };

  const locations = buildLocations();
  const byZone = (zone: ZoneCode) => locations.filter((location) => location.zone === zone);
  const locationOf = (id: string) => locations.find((location) => location.id === id)!;

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
      const updatedAt = ago(int(20, 60), int(0, 23));
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
          // 출고 지시 수량은 아래에서 실제 출고 지시의 할당으로만 채웁니다.
          reserved: 0,
          version: 1,
          updatedAt,
          updatedBy: 'u-kim',
        });
      }
      serial += 7;
    });
  }
  const skuOf = (id: string) => skus.find((sku) => sku.id === id)!;
  const stockOf = (id: string) => stocks.find((stock) => stock.id === id)!;

  const movements: Movement[] = [];
  const history: HistoryEntry[] = [];
  const activity: Activity[] = [];
  let mv = 1;
  let hi = 1;
  let ac = 1;
  const log = (entry: Omit<Activity, 'id'>) =>
    activity.push({ id: `ac-${pad(ac++, 4)}`, ...entry });

  // 최근 60일 입출고 기록(관리자가 백오피스에서 남긴 것). 마지막 40건은 활동 기록에도 남습니다.
  const manual: Movement[] = [];
  for (let day = 60; day >= 1; day--) {
    const count = int(6, 13);
    for (let i = 0; i < count; i++) {
      const stock = pick(stocks);
      const roll = rand();
      const type: MovementType =
        roll < 0.4 ? 'receipt' : roll < 0.82 ? 'shipment' : roll < 0.94 ? 'transfer' : 'adjustment';
      const target = locationOf(stock.locationId);
      const others = byZone(target.zone).filter((location) => location.id !== target.id);
      const other = others.length > 0 ? pick(others) : target;
      const delta = type === 'adjustment' ? pick([-3, -2, -1, -1, 1]) : 0;
      // 난수를 뽑는 순서(수량 → 사유 → 참조 번호 → 시각 → 처리자)를 지켜야 같은 시드가 같은 자료를 만듭니다.
      const qty = type === 'adjustment' ? Math.abs(delta) : int(2, 24);
      const reason =
        type === 'receipt'
          ? pick(['정기 입고', '정기 입고', '정기 입고', '긴급 입고', '반품 입고'])
          : type === 'shipment'
            ? pick(['고객사 출고', '고객사 출고', '고객사 출고', '샘플 출고'])
            : type === 'transfer'
              ? pick(['로케이션 재배치', '피킹 선반 보충'])
              : delta > 0
                ? '오입고 정정'
                : pick(['파손 폐기', '유통기한 경과 폐기']);
      const refNo = type === 'receipt' || type === 'shipment' ? pad(int(100, 999), 4) : null;
      const at = workday(day, int(8, 18));
      const by =
        type === 'receipt'
          ? pick(['u-seo', 'u-seo', 'u-kim'])
          : type === 'shipment'
            ? pick(['u-kim', 'u-park', 'u-seo'])
            : pick(['u-kim', 'u-park']);
      const movement: Movement = {
        id: `mv-${pad(mv++, 5)}`,
        type,
        skuId: stock.skuId,
        fromLocationId: type === 'receipt' || type === 'adjustment' ? null : stock.locationId,
        toLocationId:
          type === 'shipment' ? null : type === 'transfer' ? other.id : stock.locationId,
        qty,
        delta,
        reason,
        // 발주(PO)·수주(SO) 번호는 기록 날짜의 달로 붙습니다.
        ref: refNo && `${type === 'receipt' ? 'PO' : 'SO'}-${monthOf(at)}-${refNo}`,
        at,
        by,
      };
      movements.push(movement);
      manual.push(movement);
    }
  }

  // 실사 작업: 오래된 작업부터 만들어, 앞서 승인된 작업이 재고에 반영된 뒤의 수량을 다음 작업이 장부 수량으로 찍습니다.
  const counts: CountTask[] = [];
  const countLines: CountLine[] = [];
  const zoneStocks = (zone: ZoneCode, aisle?: number) =>
    stocks.filter((stock) => {
      const location = locationOf(stock.locationId);
      return location.zone === zone && (aisle === undefined || location.aisle === aisle);
    });
  const chronological = [...TASKS].sort((a, b) => b[7] - a[7] || a[0] - b[0]);
  for (const [
    n,
    title,
    zone,
    aisle,
    assigneeId,
    status,
    blind,
    daysAgo,
    dueIn,
    ratio,
  ] of chronological) {
    const id = `ct-${pad(n, 3)}`;
    const code = `CC-${yymm}-${pad(n, 3)}`;
    const createdAt = daysAgo === 0 ? ago(0, 2) : workday(daysAgo, 9);
    const startedAt = daysAgo === 0 ? null : workday(daysAgo, 10);
    const submittedAt =
      status === 'submitted' || status === 'approved' ? workday(daysAgo - 1, 16) : null;
    const approvedAt = status === 'approved' ? workday(daysAgo - 2, 11) : null;
    const cancelledAt = status === 'cancelled' ? workday(daysAgo - 2, 14) : null;
    const approverId = n % 2 === 0 ? 'u-park' : 'u-kim';
    const assignee = nameOf(assigneeId);

    const lines: CountLine[] = zoneStocks(zone, aisle).map((stock, index, all) => {
      const counted = status !== 'open' && index / Math.max(1, all.length) < ratio;
      const off = counted && rand() < 0.22 ? pick([-3, -2, -1, 1, 2]) : 0;
      return {
        id: `cl-${id}-${pad(index, 3)}`,
        taskId: id,
        skuId: stock.skuId,
        locationId: stock.locationId,
        stockId: stock.id,
        expectedQty: stock.onHand,
        snapshotVersion: stock.version,
        snapshotAt: createdAt,
        countedQty: counted ? Math.max(0, stock.onHand + off) : null,
        countedAt: null,
        countedBy: counted ? assigneeId : null,
        status: counted ? 'counted' : 'pending',
        note:
          off !== 0 ? pick(['파손품 1개 따로 보관', '라벨 불일치', '옆 칸에 섞여 있음', '']) : '',
        version: counted ? 2 : 1,
        updatedAt: createdAt,
        updatedBy: counted ? assigneeId : 'u-kim',
      };
    });
    // 센 시각은 시작부터 제출(진행 중이면 조금 전)까지 동선 순서대로 둡니다.
    const from = Date.parse(startedAt ?? createdAt);
    const until = Date.parse(submittedAt ?? cancelledAt ?? ago(0, 0.5));
    const counted = lines.filter((line) => line.countedQty !== null);
    counted.forEach((line, index) => {
      line.countedAt = iso(from + ((until - from) * (index + 1)) / (counted.length + 1));
      line.updatedAt = line.countedAt;
    });

    log({
      kind: 'count.created',
      message: `김하늘님이 실사 작업 ${code}(${lines.length}건)을 ${assignee}님에게 배정했습니다.`,
      at: createdAt,
      by: 'u-kim',
      target: `/counts/${id}`,
    });
    if (startedAt && counted.length > 0) {
      log({
        kind: 'count.started',
        message: `${assignee}님이 ${code} 실사를 시작했습니다.`,
        at: startedAt,
        by: assigneeId,
        target: `/counts/${id}`,
      });
    }
    if (status === 'in_progress') {
      // 진행 중인 작업은 최근에 센 몇 건이 활동 기록에 보입니다.
      for (const line of counted.slice(-4)) {
        const sku = skuOf(line.skuId);
        log({
          kind: 'count.line',
          message: `${assignee}님이 ${code}에서 ${sku.name} ${line.countedQty}${sku.unit}을(를) 셌습니다.`,
          at: line.countedAt!,
          by: assigneeId,
          target: `/counts/${id}`,
        });
      }
    }
    if (submittedAt) {
      log({
        kind: 'count.submitted',
        message: `${assignee}님이 ${code} 실사를 제출했습니다.`,
        at: submittedAt,
        by: assigneeId,
        target: `/counts/${id}`,
      });
    }
    if (cancelledAt) {
      log({
        kind: 'count.cancelled',
        message: `김하늘님이 ${code} 실사를 취소했습니다.`,
        at: cancelledAt,
        by: 'u-kim',
        target: `/counts/${id}`,
      });
    }
    if (approvedAt) {
      // 승인: 차이를 재고에 반영하고 실사 반영 기록과 재고 변경 이력을 남깁니다(서버의 승인과 같은 모양).
      const diffs = counted.filter((line) => line.countedQty !== line.expectedQty);
      const message = `${nameOf(approverId)}님이 ${code}을(를) 승인해 ${diffs.length}건의 차이를 재고에 반영했습니다.`;
      for (const line of diffs) {
        const stock = stockOf(line.stockId);
        const before = stock.onHand;
        const delta = line.countedQty! - before;
        stock.onHand = line.countedQty!;
        stock.version += 1;
        stock.updatedAt = approvedAt;
        stock.updatedBy = approverId;
        movements.push({
          id: `mv-${pad(mv++, 5)}`,
          type: 'count',
          skuId: line.skuId,
          fromLocationId: null,
          toLocationId: line.locationId,
          qty: Math.abs(delta),
          delta,
          reason: '실사 차이 반영',
          ref: code,
          at: approvedAt,
          by: approverId,
        });
        history.push({
          id: `hi-${pad(hi++, 4)}`,
          kind: 'stock',
          docId: stock.id,
          skuId: stock.skuId,
          version: stock.version,
          at: approvedAt,
          by: approverId,
          reason: message,
          locationCode: locationOf(stock.locationId).code,
          changes: [{ field: 'onHand', label: '보유', before, after: stock.onHand }],
          blocked: false,
        });
      }
      log({
        kind: 'count.approved',
        message,
        at: approvedAt,
        by: approverId,
        target: `/counts/${id}`,
      });
    }

    const transitions = [startedAt && counted.length > 0, submittedAt, approvedAt, cancelledAt];
    const last = [approvedAt, cancelledAt, submittedAt, startedAt, createdAt].find(Boolean)!;
    counts.push({
      id,
      code,
      title,
      zone,
      assigneeId,
      status,
      blind,
      dueAt: iso(now.getTime() + dueIn * DAY),
      createdAt,
      createdBy: 'u-kim',
      submittedAt,
      approvedAt,
      version: 1 + transitions.filter(Boolean).length,
      updatedAt: last,
      updatedBy: approvedAt
        ? approverId
        : cancelledAt
          ? 'u-kim'
          : submittedAt
            ? assigneeId
            : 'u-kim',
    });
    countLines.push(...lines);
  }
  counts.sort((a, b) => a.id.localeCompare(b.id));
  countLines.sort((a, b) => a.id.localeCompare(b.id));

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

  // 품목 정보 수정 몇 건(변경 이력 화면에 보임). 첫 품목은 README 화면을 찍을 때 직접 고치므로 비워 둡니다.
  const edits: [
    skuIndex: number,
    field: 'safetyStock' | 'unitCost',
    by: string,
    daysAgo: number,
  ][] = [
    [13, 'safetyStock', 'u-kim', 18],
    [27, 'unitCost', 'u-park', 15],
    [40, 'safetyStock', 'u-kim', 11],
    [52, 'unitCost', 'u-seo', 8],
    [75, 'safetyStock', 'u-kim', 6],
    [88, 'safetyStock', 'u-park', 4],
    [99, 'unitCost', 'u-seo', 3],
    [112, 'safetyStock', 'u-kim', 2],
  ];
  for (const [index, field, by, daysAgo] of edits) {
    const sku = skus[index]!;
    const before = sku[field];
    const after =
      field === 'safetyStock' ? before + pick([10, 20]) : Math.round((before * 1.08) / 100) * 100;
    const at = workday(daysAgo, int(9, 17));
    const message = `${nameOf(by)}님이 ${sku.name} 정보를 수정했습니다.`;
    sku[field] = after;
    sku.version += 1;
    sku.updatedAt = at;
    sku.updatedBy = by;
    history.push({
      id: `hi-${pad(hi++, 4)}`,
      kind: 'sku',
      docId: sku.id,
      skuId: sku.id,
      version: sku.version,
      at,
      by,
      reason: message,
      locationCode: null,
      changes: [{ field, label: field === 'safetyStock' ? '안전 재고' : '단가', before, after }],
      blocked: false,
    });
    log({ kind: 'sku.updated', message, at, by, target: `/inventory/${sku.id}` });
  }

  // 출고 지시: 예약, 피킹 중, 피킹 완료, 출고 완료, 취소
  const orders: ShipmentOrder[] = [];
  const usedSkus = new Set<string>();
  const busyStocks = new Set(
    countLines
      .filter((line) => {
        const task = counts.find((t) => t.id === line.taskId)!;
        return task.status !== 'approved' && task.status !== 'cancelled';
      })
      .map((line) => line.stockId),
  );
  // 실사 중인 재고는 피해서 할당합니다(데모에서 실사 정산과 엉키지 않게).
  const freeOf = (skuId: string) =>
    stocks
      .filter((stock) => stock.skuId === skuId && !busyStocks.has(stock.id))
      .reduce((sum, stock) => sum + Math.max(0, stock.onHand - stock.reserved), 0);
  for (const [n, customer, assigneeId, status, wants, createdHoursAgo, dueInHours] of ORDERS) {
    const id = `so-${pad(n, 3)}`;
    const code = `SO-${yymm}-${pad(n, 4)}`;
    const createdAt = ago(0, createdHoursAgo);
    const pickedAt = (index: number) => ago(0, Math.max(0.5, createdHoursAgo - 1 - index * 0.25));
    const lines: ShipmentOrder['lines'] = [];
    wants.forEach(([skuIndex, wanted], index) => {
      // 고른 품목에 가용 재고가 모자라면 다음 품목으로 넘어가고, 수량은 가용 재고 안으로 줄입니다.
      let sku = skus[skuIndex]!;
      for (let step = 0; step < skus.length; step++) {
        const candidate = skus[(skuIndex + step) % skus.length]!;
        if (freeOf(candidate.id) >= 2 && !usedSkus.has(candidate.id)) {
          sku = candidate;
          break;
        }
      }
      const qty = Math.min(wanted, freeOf(sku.id));
      if (qty < 1) return;
      usedSkus.add(sku.id);
      const candidates = stocks.filter(
        (stock) => stock.skuId === sku.id && !busyStocks.has(stock.id),
      );
      const picks = allocate(candidates, qty);
      if (!picks) return;
      const picked =
        status === 'shipped' || status === 'picked' || (status === 'picking' && index === 0);
      lines.push({
        id: `${id}-l${index}`,
        skuId: sku.id,
        qty,
        allocations: picks.map((pick, i) => {
          // 출고했거나 취소한 지시는 예약이 풀려 있습니다.
          if (status !== 'shipped' && status !== 'cancelled') pick.stock.reserved += pick.qty;
          return {
            id: `${id}-l${index}-a${i}`,
            stockId: pick.stock.id,
            locationId: pick.stock.locationId,
            qty: pick.qty,
            pickedQty: picked ? pick.qty : null,
            pickedBy: picked ? assigneeId : null,
            pickedAt: picked ? pickedAt(index) : null,
            note: '',
          };
        }),
      });
    });
    const shippedAt = status === 'shipped' ? ago(0, Math.max(0.5, createdHoursAgo - 3)) : null;
    const cancelledAt = status === 'cancelled' ? ago(0, Math.max(0.5, createdHoursAgo - 4)) : null;
    const assignee = nameOf(assigneeId);
    log({
      kind: 'order.created',
      message: `박도윤님이 ${customer} 출고 지시 ${code}(${lines.length}품목)를 만들고 재고를 예약했습니다.`,
      at: createdAt,
      by: 'u-park',
      target: `/orders/${id}`,
    });
    if (status === 'picking') {
      const first = lines[0]!;
      const sku = skuOf(first.skuId);
      log({
        kind: 'order.picked',
        message: `${assignee}님이 ${code}에서 ${sku.name} ${first.qty}${sku.unit}을(를) 집었습니다.`,
        at: pickedAt(0),
        by: assigneeId,
        target: `/orders/${id}`,
      });
    }
    if (status === 'picked' || status === 'shipped') {
      log({
        kind: 'order.picked',
        message: `${assignee}님이 ${code} 피킹을 마쳤습니다.`,
        at: pickedAt(lines.length - 1),
        by: assigneeId,
        target: `/orders/${id}`,
      });
    }
    if (shippedAt) {
      for (const line of lines) {
        for (const allocation of line.allocations) {
          movements.push({
            id: `mv-${pad(mv++, 5)}`,
            type: 'shipment',
            skuId: line.skuId,
            fromLocationId: allocation.locationId,
            toLocationId: null,
            qty: allocation.pickedQty ?? allocation.qty,
            delta: 0,
            reason: `${customer} 출고`,
            ref: code,
            at: shippedAt,
            by: 'u-park',
          });
        }
      }
      log({
        kind: 'order.shipped',
        message: `박도윤님이 ${code}을(를) 출고했습니다.`,
        at: shippedAt,
        by: 'u-park',
        target: `/orders/${id}`,
      });
    }
    if (cancelledAt) {
      log({
        kind: 'order.cancelled',
        message: `박도윤님이 ${code}을(를) 취소하고 예약을 풀었습니다.`,
        at: cancelledAt,
        by: 'u-park',
        target: `/orders/${id}`,
      });
    }
    // 집을 때마다, 출고·취소할 때 버전이 오릅니다.
    const pickedLines = lines.filter((line) => line.allocations[0]?.pickedQty != null).length;
    const closedAt = shippedAt ?? cancelledAt;
    orders.push({
      id,
      code,
      customer,
      status,
      assigneeId,
      dueAt: iso(now.getTime() + dueInHours * HOUR),
      createdAt,
      createdBy: 'u-park',
      shippedAt,
      lines,
      version: 1 + pickedLines + (closedAt ? 1 : 0),
      updatedAt: closedAt ?? (pickedLines > 0 ? pickedAt(pickedLines - 1) : createdAt),
      updatedBy: closedAt || pickedLines === 0 ? 'u-park' : assigneeId,
    });
  }

  for (const movement of manual.slice(-40)) {
    log({
      kind: 'movement',
      message: describeManual(movement, skuOf(movement.skuId), locationOf),
      at: movement.at,
      by: movement.by,
      target: `/inventory/${movement.skuId}`,
    });
  }
  movements.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  activity.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  history.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

  return {
    users: USERS,
    locations,
    skus,
    stocks,
    movements,
    counts,
    countLines,
    orders,
    history,
    activity,
  };
}

/** 관리자가 백오피스에서 남긴 입출고의 활동 문구(서버가 남기는 문구와 같은 모양) */
function describeManual(
  movement: Movement,
  sku: Sku,
  locationOf: (id: string) => Location,
): string {
  const who = nameOf(movement.by);
  const code = (id: string | null) => (id ? locationOf(id).code : '');
  const amount = `${sku.name} ${movement.qty}${sku.unit}을(를)`;
  switch (movement.type) {
    case 'receipt':
      return `${who}님이 ${amount} ${code(movement.toLocationId)}에 입고했습니다.`;
    case 'shipment':
      return `${who}님이 ${amount} ${code(movement.fromLocationId)}에서 출고했습니다.`;
    case 'transfer':
      return `${who}님이 ${amount} ${code(movement.fromLocationId)} → ${code(movement.toLocationId)}로 옮겼습니다.`;
    default:
      return `${who}님이 ${sku.name}(${code(movement.toLocationId)}) 재고를 ${movement.delta > 0 ? '+' : ''}${movement.delta}${sku.unit} 조정했습니다(${movement.reason}).`;
  }
}
