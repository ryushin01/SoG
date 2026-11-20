import type { ChangeEvent } from '@sog/domain';
import type { StoreName, WriteOp } from './idb';

/**
 * 데모 서버의 저장 계층. 브라우저에서는 IndexedDB, 서버에서는 Postgres가 구현합니다.
 * 쓰기는 한 번의 write 호출 안에서 모두 반영되거나 모두 취소되어야 합니다.
 */
export interface Storage {
  get<T>(store: StoreName, id: string): Promise<T | undefined>;
  /** 여러 문서를 한 번에 읽습니다(Postgres는 쿼리 하나). 없는 ID는 빠지고 순서는 정하지 않습니다. */
  getMany<T extends { id: string }>(store: StoreName, ids: readonly string[]): Promise<T[]>;
  all<T>(store: StoreName): Promise<T[]>;
  write(ops: WriteOp[]): Promise<void>;
  /**
   * 기록 시각(`at`, ISO 문자열)이 before보다 이른 문서를 지우고 지운 수를 돌려줍니다.
   * 보관 기간 정리에 씁니다(Postgres는 문서를 읽어 오지 않고 쿼리 하나로 지움).
   */
  deleteOlderThan(store: StoreName, before: string): Promise<number>;
  close(): void;
}

/** 변경 알림. 브라우저에서는 BroadcastChannel, 서버에서는 events 테이블이 구현합니다. */
export interface ChangePublisher {
  publish(event: ChangeEvent): void | Promise<void>;
  subscribe(listener: (event: ChangeEvent) => void): () => void;
  close(): void;
}

export function broadcastPublisher(name: string): ChangePublisher {
  const listeners = new Set<(event: ChangeEvent) => void>();
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(name) : null;
  channel?.addEventListener('message', (message: MessageEvent<ChangeEvent>) => {
    listeners.forEach((listener) => listener(message.data));
  });
  return {
    publish(event) {
      listeners.forEach((listener) => listener(event));
      channel?.postMessage(event);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      channel?.close();
    },
  };
}
