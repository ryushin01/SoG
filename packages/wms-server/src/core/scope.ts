/** 라우트와 조회 모델이 함께 쓰는 서버 범위: 저장소, 잠금, 읽기 도우미, 시계, ID, 버전·담당자 검사 */
import type {
  ChangeEvent,
  CountLine,
  CountTask,
  Location,
  Movement,
  ShipmentOrder,
  Sku,
  StockLevel,
  User,
} from '@sog/domain';
import type { StoreName } from '../idb';
import type { Lock } from '../lock';
import type { Storage } from '../storage';
import { HttpError, type Context } from './types';

/** 저장소 전체 읽기. 사용자 목록만 잠깐 기억합니다(시드로만 바뀜). */
export interface Loaders {
  users: () => Promise<User[]>;
  locations: () => Promise<Location[]>;
  skus: () => Promise<Sku[]>;
  stocks: () => Promise<StockLevel[]>;
  movements: () => Promise<Movement[]>;
  counts: () => Promise<CountTask[]>;
  lines: () => Promise<CountLine[]>;
  orders: () => Promise<ShipmentOrder[]>;
}

export interface ScopeBase {
  db: Storage;
  /** 쓰기 직렬화(탭·인스턴스 사이) */
  lock: Lock;
  load: Loaders;
  now: () => Date;
  nowSeconds: () => number;
  newId: (prefix: string) => string;
  /** 이 서버(탭)의 출처. 원격 클라이언트는 x-sog-origin으로 알립니다. */
  origin: string;
  authSecret: string;
  emit: (event: ChangeEvent) => void | Promise<void>;
  /** 데모 데이터를 처음 상태로 다시 채웁니다(잠금 안에서 부름). */
  writeSeed: () => Promise<void>;
}

export interface ServerScope extends ScopeBase {
  mustGet<T>(store: StoreName, id: string, label: string): Promise<T>;
  requireVersion(
    ctx: Context,
    resource: { version: number },
    current: () => Promise<unknown>,
  ): Promise<void>;
  requireAssignee(ctx: Context, assigneeId: string): void;
  touch<T extends { version: number; updatedAt: string; updatedBy: string }>(
    value: T,
    user: User,
  ): T;
}

export function createScope(base: ScopeBase): ServerScope {
  const { db, now } = base;

  async function mustGet<T>(store: StoreName, id: string, label: string): Promise<T> {
    const value = await db.get<T>(store, id);
    if (!value) throw new HttpError(404, 'NOT_FOUND', `${label}을(를) 찾을 수 없습니다.`);
    return value;
  }

  function requireVersion(
    ctx: Context,
    resource: { version: number },
    current: () => Promise<unknown>,
  ) {
    if (ctx.ifMatch === null) {
      throw new HttpError(
        428,
        'PRECONDITION_REQUIRED',
        '수정하려면 마지막으로 받은 버전(If-Match)이 필요합니다.',
      );
    }
    if (ctx.ifMatch !== resource.version) {
      return current().then((value) => {
        throw new HttpError(
          412,
          'VERSION_CONFLICT',
          '다른 사용자가 먼저 변경했습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.',
          value,
        );
      });
    }
    return Promise.resolve();
  }

  /** 작업자는 자기에게 배정된 작업만 할 수 있습니다. 관리자는 모두 할 수 있습니다. */
  function requireAssignee(ctx: Context, assigneeId: string): void {
    if (ctx.user.role !== 'manager' && ctx.user.id !== assigneeId) {
      throw new HttpError(403, 'FORBIDDEN', '배정된 작업자만 할 수 있습니다.');
    }
  }

  function touch<T extends { version: number; updatedAt: string; updatedBy: string }>(
    value: T,
    user: User,
  ): T {
    return {
      ...value,
      version: value.version + 1,
      updatedAt: now().toISOString(),
      updatedBy: user.id,
    };
  }

  return { ...base, mustGet, requireVersion, requireAssignee, touch };
}
