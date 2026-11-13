/** IndexedDB를 Promise로 감싼 작은 저장소. 같은 출처의 모든 탭이 이 데이터를 함께 씁니다. */

export const STORES = [
  'meta',
  'users',
  'locations',
  'skus',
  'stocks',
  'movements',
  'counts',
  'countLines',
  'orders',
  'history',
  'activity',
  'idempotency',
] as const;

/** 저장소를 추가하면 올립니다. 올라가면 없는 저장소를 만들고, 서버가 시드 버전을 보고 다시 채웁니다. */
export const DB_VERSION = 3;

export type StoreName = (typeof STORES)[number];

export type WriteOp =
  | { store: StoreName; put: { id: string } }
  | { store: StoreName; delete: string }
  | { store: StoreName; clear: true };

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class Database {
  private constructor(private readonly db: IDBDatabase) {}

  static open(name: string): Promise<Database> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // 다른 탭이 지우거나 버전을 올리면 연결을 놓아 줍니다.
        db.onversionchange = () => db.close();
        resolve(new Database(db));
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB가 다른 탭에 막혀 있습니다.'));
    });
  }

  all<T>(store: StoreName): Promise<T[]> {
    const tx = this.db.transaction(store, 'readonly');
    return promisify(tx.objectStore(store).getAll()) as Promise<T[]>;
  }

  get<T>(store: StoreName, id: string): Promise<T | undefined> {
    const tx = this.db.transaction(store, 'readonly');
    return promisify(tx.objectStore(store).get(id)) as Promise<T | undefined>;
  }

  /** 여러 저장소의 쓰기를 한 트랜잭션으로 처리합니다. 하나라도 실패하면 모두 되돌립니다. */
  write(ops: WriteOp[]): Promise<void> {
    if (ops.length === 0) return Promise.resolve();
    const names = [...new Set(ops.map((op) => op.store))];
    const tx = this.db.transaction(names, 'readwrite');
    for (const op of ops) {
      const store = tx.objectStore(op.store);
      if ('put' in op) store.put(op.put);
      else if ('delete' in op) store.delete(op.delete);
      else store.clear();
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('트랜잭션이 중단되었습니다.'));
    });
  }

  close(): void {
    this.db.close();
  }
}
