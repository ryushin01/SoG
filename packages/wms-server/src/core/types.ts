/** 업무 서버의 요청·응답과 공통 타입 */
import type { ActivityKind, ApiError, ChangeEvent, User } from '@sog/domain';
import type { WriteOp } from '../idb';
import type { Lock } from '../lock';
import type { ChangePublisher, Storage } from '../storage';

export interface ServerRequest {
  method: string;
  /** /api/... 형태의 경로와 쿼리 */
  url: string;
  headers: Record<string, string | null | undefined>;
  body?: unknown;
}

export interface ServerResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface WmsServerOptions {
  dbName?: string;
  /** 응답 지연 범위(ms). 경쟁 상태를 눈으로 확인할 수 있게 실제 네트워크처럼 늦춥니다. */
  latency?: [number, number];
  now?: () => Date;
  channelName?: string;
  /** 저장 계층. 없으면 IndexedDB(dbName)를 씁니다. */
  storage?: Storage;
  /** 쓰기 직렬화. 없으면 Web Locks(탭 사이 공유)를 씁니다. */
  lock?: Lock;
  /** 변경 알림. 없으면 BroadcastChannel을 씁니다. */
  publisher?: ChangePublisher;
  /** 로그인 토큰 서명 키. 없으면 데모 모드용 고정 값을 씁니다. */
  authSecret?: string;
  /**
   * 저장된 시드 버전이 다르면 데이터를 지우고 다시 채울지.
   * 브라우저 안 데모(IndexedDB)만 기본으로 켭니다. 실제 서버는 배포 중 옛 인스턴스와 새 인스턴스가 함께 돌면서
   * 서로를 낡았다고 보고 데이터를 거듭 지울 수 있으므로, 시드가 아예 없을 때만 채웁니다.
   */
  reseedOnVersionChange?: boolean;
}

export interface WmsServer {
  readonly origin: string;
  handle(request: ServerRequest): Promise<ServerResponse>;
  /** 이 탭과 다른 탭에서 일어난 변경을 받습니다. */
  subscribe(listener: (event: ChangeEvent) => void): () => void;
  reset(): Promise<void>;
  /**
   * 보관 기간이 지난 기록을 지웁니다(RETENTION_DAYS). 매일 초기화를 끈 운영에서 예약 작업이 부릅니다.
   * 품목·재고·입출고·실사·출고 지시 같은 업무 데이터는 지우지 않습니다.
   */
  prune(): Promise<PruneResult>;
  close(): void;
}

/**
 * 기록 보관 기간(일). 멱등 기록은 같은 요청을 다시 보냈는지 가리는 데만 쓰여 하루면 충분하고,
 * 활동 기록은 화면의 최근 흐름, 변경 이력은 품목별 감사 기록이라 더 오래 둡니다.
 */
export const RETENTION_DAYS = { idempotency: 1, activity: 90, history: 365 } as const;

/** 정리에서 저장소마다 지운 문서 수 */
export type PruneResult = Record<keyof typeof RETENTION_DAYS, number>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiError['code'],
    message: string,
    readonly current?: unknown,
  ) {
    super(message);
  }
}

/** 요청 하나의 문맥: 로그인한 사용자, 보낸 탭, 버전(If-Match), 멱등 키, 쿼리와 본문 */
export interface Context {
  user: User;
  /** 요청을 보낸 탭. 원격 클라이언트는 x-sog-origin으로 알려 자기 변경을 구분합니다. */
  origin: string;
  ifMatch: number | null;
  idempotencyKey: string | null;
  query: URLSearchParams;
  body: unknown;
}

/** 쓰기 처리기가 돌려주는 결과. 공통 쓰기 처리(mutate)가 변경 이력·활동 기록·멱등 기록을 더해 저장합니다. */
export interface MutationResult {
  status?: number;
  body: unknown;
  etag?: number;
  ops: WriteOp[];
  topics: string[];
  activity: { kind: ActivityKind; message: string; target: string | null }[];
}

export interface IdempotencyRecord {
  id: string;
  status: number;
  body: unknown;
  etag?: number;
  at: string;
}

export type Handler = (ctx: Context, params: Record<string, string>) => Promise<ServerResponse>;

/** 라우트: 메서드, 경로 패턴(:이름은 매개변수), 처리기 */
export type Route = [method: string, pattern: string, handler: Handler];
