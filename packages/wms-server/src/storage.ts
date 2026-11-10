import type { ChangeEvent } from '@sog/domain';
import type { StoreName, WriteOp } from './idb';

/**
 * 데모 서버의 저장 계층. 브라우저에서는 IndexedDB, 서버에서는 Postgres가 구현합니다.
 * 쓰기는 한 번의 write 호출 안에서 모두 반영되거나 모두 취소되어야 합니다.
 */
export interface Storage {
  get<T>(store: StoreName, id: string): Promise<T | undefined>;
  all<T>(store: StoreName): Promise<T[]>;
  write(ops: WriteOp[]): Promise<void>;
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
