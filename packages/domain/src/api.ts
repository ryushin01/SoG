/** 데모 서버(/api)의 요청·응답 형식. 두 앱의 API 클라이언트가 이 타입으로 통신합니다. */
import type {
  Activity,
  Allocation,
  OrderStatus,
  ShipmentOrder,
  CountLine,
  CountTask,
  Location,
  Movement,
  Sku,
  SkuCategory,
  StockLevel,
  User,
  Zone,
  ZoneCode,
} from './types';
import type { StockStatus } from './rules';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface SkuSummary extends Sku {
  onHand: number;
  reserved: number;
  available: number;
  locationCount: number;
  status: StockStatus;
}

export type SkuSort = 'code' | 'name' | 'onHand' | 'available' | 'value' | 'updatedAt';

export interface SkuQuery {
  q?: string;
  category?: SkuCategory | '';
  status?: StockStatus | '';
  zone?: ZoneCode | '';
  sort?: SkuSort;
  dir?: 'asc' | 'desc';
  page?: number;
  size?: number;
}

export interface StockWithLocation extends StockLevel {
  location: Location;
}

export interface SkuDetail {
  sku: Sku;
  stocks: StockWithLocation[];
  movements: Movement[];
  status: StockStatus;
}

export interface SkuPatch {
  name?: string;
  safetyStock?: number;
  unitCost?: number;
  description?: string;
}

export interface AdjustRequest {
  /** 실물 확인 후의 수량 */
  onHand: number;
  reason: string;
}

export type MovementRequest =
  | {
      type: 'receipt';
      skuId: string;
      toLocationId: string;
      qty: number;
      reason: string;
      ref?: string;
    }
  | {
      type: 'shipment';
      skuId: string;
      fromLocationId: string;
      qty: number;
      reason: string;
      ref?: string;
    }
  | {
      type: 'transfer';
      skuId: string;
      fromLocationId: string;
      toLocationId: string;
      qty: number;
      reason: string;
    };

export interface DashboardKpis {
  skuCount: number;
  totalUnits: number;
  inventoryValue: number;
  lowStock: number;
  outOfStock: number;
  openCounts: number;
  pendingReview: number;
  /** 아직 출고하지 않은 출고 지시(피킹 대기·피킹 중·출고 대기) */
  pendingOrders: number;
  /** 최근 승인된 실사의 재고 정확도(%) */
  accuracy: number | null;
  /** 최근 14일 일별 입고·출고 수량 */
  flow: { date: string; receipt: number; shipment: number }[];
  /** 구역별 재고 금액 */
  zoneValue: { zone: ZoneCode; value: number; units: number }[];
}

export interface CountLineView extends CountLine {
  sku: Pick<
    Sku,
    'id' | 'code' | 'name' | 'barcode' | 'unit' | 'unitCost' | 'shape' | 'hue' | 'category'
  >;
  location: Location;
  /** 작업을 만든 뒤 이 재고에 일어난 이동의 순증감 */
  movedSinceSnapshot: number;
  /** 실사 시점 뒤에 일어난 이동의 순증감. 승인할 때 반영할 수량을 계산합니다. */
  movedSinceCount: number;
}

export interface CountTaskSummary extends CountTask {
  assignee: User;
  lineCount: number;
  countedCount: number;
  recountCount: number;
  varianceCount: number;
}

export interface CountTaskDetail {
  task: CountTaskSummary;
  lines: CountLineView[];
}

export interface CreateCountRequest {
  title: string;
  zone: ZoneCode;
  /** 비우면 구역의 모든 재고를 대상으로 합니다. */
  locationIds?: string[];
  assigneeId: string;
  blind: boolean;
  dueAt: string;
}

export interface SubmitCountLineRequest {
  countedQty: number;
  note?: string;
}

export type LocationStatus = 'empty' | 'ok' | 'low' | 'out';

/** 창고 도면의 로케이션 한 칸 */
export interface LocationOverview {
  location: Location;
  units: number;
  value: number;
  skuCount: number;
  /** 이 칸에 있는 품목 중 가장 나쁜 상태(품목 전체 재고 기준) */
  status: LocationStatus;
  /** 진행 중인 실사 작업이 이 칸을 세고 있으면 작업 코드 */
  countingTask: string | null;
}

export interface LocationDetail {
  overview: LocationOverview;
  items: { sku: SkuSummary; onHand: number; reserved: number; version: number }[];
}

export interface Reference {
  zones: Zone[];
  locations: Location[];
  users: User[];
}

export interface ApiError {
  code:
    | 'NOT_FOUND'
    | 'VALIDATION'
    | 'PRECONDITION_REQUIRED'
    | 'VERSION_CONFLICT'
    | 'INSUFFICIENT_STOCK'
    | 'INVALID_STATE'
    | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'NETWORK';
  message: string;
  /** VERSION_CONFLICT일 때 서버의 최신 자원 */
  current?: unknown;
}

export interface ActivityPage {
  items: Activity[];
}

/** 다른 탭(사용자)이 데이터를 바꾸면 BroadcastChannel로 퍼지는 알림 */
export interface ChangeEvent {
  /** 바뀐 자원의 경로 앞부분. 예: skus, skus/sku-001, counts/ct-002 */
  topics: string[];
  by: string;
  at: string;
  /** 알림을 보낸 탭. 자기 변경은 무시할 때 씁니다. */
  origin: string;
  message: string;
}

export interface OrderSummary extends Omit<ShipmentOrder, 'lines'> {
  assignee: User;
  lineCount: number;
  units: number;
  pickedUnits: number;
  /** 확인을 마친 할당 수 / 전체 할당 수 */
  pickedAllocations: number;
  allocationCount: number;
}

export interface AllocationView extends Allocation {
  location: Location;
}

export interface OrderLineView {
  id: string;
  qty: number;
  sku: Pick<Sku, 'id' | 'code' | 'name' | 'barcode' | 'unit' | 'shape' | 'hue' | 'category'>;
  allocations: AllocationView[];
}

export interface OrderDetail {
  order: OrderSummary;
  lines: OrderLineView[];
  /** 로케이션 순서로 정렬한 피킹 동선 */
  route: (AllocationView & { lineId: string; sku: OrderLineView['sku'] })[];
}

export interface CreateOrderRequest {
  customer: string;
  dueAt: string;
  assigneeId: string;
  lines: { skuId: string; qty: number }[];
}

export interface PickRequest {
  pickedQty: number;
  note?: string;
}

export interface OrderQuery {
  status?: OrderStatus | '';
  assigneeId?: string;
}

export interface LoginRequest {
  userId: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  /** 만료 시각(초, Unix) */
  expiresAt: number;
  user: User;
}
