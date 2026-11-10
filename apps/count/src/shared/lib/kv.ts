/**
 * 작은 IndexedDB 키-값 저장소. 현장 앱의 보낼함과 오프라인용 작업 사본을 둡니다.
 * 데모 서버의 DB와 따로 두어, 서버 데이터를 초기화해도 보내지 못한 실사 기록은 남습니다.
 */
export class KeyValueStore<T> {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly dbName: string,
    private readonly storeName: string,
  ) {}

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        for (const name of ['outbox', 'cache']) {
          if (!request.result.objectStoreNames.contains(name))
            request.result.createObjectStore(name);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.dbPromise;
  }

  private async run<R>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<R>,
  ): Promise<R> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, mode);
      const request = work(tx.objectStore(this.storeName));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  get(key: string): Promise<T | undefined> {
    return this.run('readonly', (store) => store.get(key) as IDBRequest<T | undefined>);
  }

  async all(): Promise<T[]> {
    return this.run('readonly', (store) => store.getAll() as IDBRequest<T[]>);
  }

  async set(key: string, value: T): Promise<void> {
    await this.run('readwrite', (store) => store.put(value, key));
  }

  async delete(key: string): Promise<void> {
    await this.run('readwrite', (store) => store.delete(key));
  }
}
