/** 재고 관리(WMS) 도메인 모델. 백오피스와 실사 앱, 데모 서버가 함께 씁니다. */

export type ISODateString = string;

/** 수정할 수 있는 자원은 모두 버전을 가집니다. 저장할 때 If-Match로 보내 낙관적 잠금에 씁니다. */
export interface Versioned {
  version: number;
  updatedAt: ISODateString;
  updatedBy: string;
}

export type UserRole = 'manager' | 'operator';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  /** 작업자 화면에 보이는 짧은 소속 */
  team: string;
}

export type ZoneCode = 'A' | 'B' | 'C' | 'D';

export interface Zone {
  code: ZoneCode;
  name: string;
  /** 보관 조건(상온, 냉장 등) */
  condition: string;
}

export interface Location {
  id: string;
  /** 구역-통로-랙-단. 예: A-02-03-1 */
  code: string;
  zone: ZoneCode;
  aisle: number;
  rack: number;
  level: number;
}

export type SkuCategory = 'electronics' | 'packaging' | 'tools' | 'household' | 'food' | 'apparel';

export type SkuShape = 'box' | 'bottle' | 'can' | 'pouch' | 'tube' | 'roll';

export interface Sku extends Versioned {
  id: string;
  /** 내부 품목 코드. 예: SOG-10234 */
  code: string;
  /** EAN-13 형식의 가상 바코드 */
  barcode: string;
  name: string;
  category: SkuCategory;
  unit: string;
  /** 단가(원) */
  unitCost: number;
  /** 이 수량 아래로 내려가면 부족 재고로 봅니다. */
  safetyStock: number;
  /** 무게(g) */
  weight: number;
  /** 가로×세로×높이(mm) */
  dimensions: [number, number, number];
  /** 실사 앱의 품목 그림을 그릴 때 쓰는 모양과 색 */
  shape: SkuShape;
  hue: number;
  description: string;
}

/** 품목 한 개가 로케이션 한 곳에 있는 수량. 실사·조정·이동은 모두 이 단위로 일어납니다. */
export interface StockLevel extends Versioned {
  id: string;
  skuId: string;
  locationId: string;
  onHand: number;
  /** 출고 지시로 묶인 수량. 가용 재고 = onHand - reserved */
  reserved: number;
}

export type MovementType = 'receipt' | 'shipment' | 'transfer' | 'adjustment' | 'count';

export interface Movement {
  id: string;
  type: MovementType;
  skuId: string;
  /** 출발 로케이션(출고·이동) */
  fromLocationId: string | null;
  /** 도착 로케이션(입고·이동) */
  toLocationId: string | null;
  /** 항상 양수. 조정·실사의 증감 방향은 delta로 봅니다. */
  qty: number;
  /** 조정·실사일 때 재고 증감(+/-) */
  delta: number;
  reason: string;
  ref: string | null;
  at: ISODateString;
  by: string;
}

export type CountTaskStatus = 'open' | 'in_progress' | 'submitted' | 'approved' | 'cancelled';

export interface CountTask extends Versioned {
  id: string;
  /** 예: CC-2611-004 */
  code: string;
  title: string;
  zone: ZoneCode;
  assigneeId: string;
  status: CountTaskStatus;
  /** 장부 수량을 작업자에게 숨기는 블라인드 실사 */
  blind: boolean;
  dueAt: ISODateString;
  createdAt: ISODateString;
  createdBy: string;
  submittedAt: ISODateString | null;
  approvedAt: ISODateString | null;
}

export type CountLineStatus = 'pending' | 'counted' | 'recount';

export interface CountLine extends Versioned {
  id: string;
  taskId: string;
  skuId: string;
  locationId: string;
  stockId: string;
  /** 작업을 만들 때 찍어 둔 장부 수량 */
  expectedQty: number;
  /** 작업을 만들 때의 재고 버전. 실사 도중 재고가 움직였는지 판단합니다. */
  snapshotVersion: number;
  snapshotAt: ISODateString;
  countedQty: number | null;
  countedAt: ISODateString | null;
  countedBy: string | null;
  status: CountLineStatus;
  note: string;
}

export type ActivityKind =
  | 'movement'
  | 'sku.updated'
  | 'count.created'
  | 'count.started'
  | 'count.line'
  | 'count.recount'
  | 'count.submitted'
  | 'count.approved'
  | 'count.cancelled'
  | 'order.created'
  | 'order.picked'
  | 'order.shipped'
  | 'order.cancelled'
  | 'conflict';

export interface Activity {
  id: string;
  kind: ActivityKind;
  message: string;
  at: ISODateString;
  by: string;
  /** 관련 자원(품목·실사 작업)의 경로. 화면에서 링크로 씁니다. */
  target: string | null;
}

export type OrderStatus = 'reserved' | 'picking' | 'picked' | 'shipped' | 'cancelled';

/** 출고 지시 한 줄의 로케이션별 할당. 할당 수량만큼 재고의 reserved가 늘어납니다. */
export interface Allocation {
  id: string;
  stockId: string;
  locationId: string;
  qty: number;
  /** 집은 수량. 아직 확인하지 않았으면 null */
  pickedQty: number | null;
  pickedBy: string | null;
  pickedAt: ISODateString | null;
  /** 덜 집었을 때의 사유 */
  note: string;
}

export interface OrderLine {
  id: string;
  skuId: string;
  qty: number;
  allocations: Allocation[];
}

/** 출고 지시. 만들 때 가용 재고를 예약(할당)하고, 피킹 뒤 출고를 확정하면 재고가 줄어듭니다. */
export interface ShipmentOrder extends Versioned {
  id: string;
  /** 예: SO-2611-0007 */
  code: string;
  customer: string;
  status: OrderStatus;
  assigneeId: string;
  dueAt: ISODateString;
  createdAt: ISODateString;
  createdBy: string;
  shippedAt: ISODateString | null;
  lines: OrderLine[];
}
