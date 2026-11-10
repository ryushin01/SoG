/**
 * 최소한의 SQL 인터페이스. 운영은 node-postgres(Neon), 테스트·로컬 미리보기는 PGlite가 구현합니다.
 */
export interface SqlExecutor {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export interface SqlDatabase extends SqlExecutor {
  /** 하나의 연결에서 BEGIN … COMMIT. 콜백이 던지면 ROLLBACK합니다. */
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

interface PgClient extends SqlExecutor {
  release(): void;
}

interface PgPool extends SqlExecutor {
  connect(): Promise<PgClient>;
  end(): Promise<void>;
}

/** node-postgres Pool을 SqlDatabase로 감쌉니다. */
export function fromPgPool(pool: PgPool): SqlDatabase {
  return {
    query: (text, params) => pool.query(text, params) as never,
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

interface PgliteLike extends SqlExecutor {
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** PGlite는 같은 모양이라 그대로 씁니다. */
export function fromPglite(db: PgliteLike): SqlDatabase {
  return {
    query: (text, params) => db.query(text, params),
    transaction: (work) => db.transaction(work),
    close: () => db.close(),
  };
}
