import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChangeEvent } from '@sog/domain';
import type { ChangePublisher, Lock, Storage, StoreName, WriteOp } from '@sog/wms-server';
import type { SqlDatabase, SqlExecutor } from './sql';

/**
 * Postgres 저장 계층.
 * - docs: 데모 서버의 저장소(store)별 문서를 jsonb로 둡니다. 업무 규칙은 데모 서버와 같은 코드를 씁니다.
 * - events: 변경 알림. 순번(seq)으로 다른 기기가 놓친 변경을 이어 받습니다.
 * - presence: 접속 표시. 탭마다 마지막 신호 시각을 둡니다.
 */
export const SCHEMA = `
create table if not exists docs (
  store text not null,
  id text not null,
  data jsonb not null,
  primary key (store, id)
);
create table if not exists events (
  seq bigserial primary key,
  at timestamptz not null default now(),
  origin text not null,
  by_user text not null,
  topics text[] not null,
  message text not null
);
create table if not exists presence (
  tab_id text primary key,
  data jsonb not null,
  seen_at timestamptz not null default now()
);
`;

/** 모든 쓰기가 같은 키의 트랜잭션 잠금을 잡아 한 줄로 섭니다(여러 함수 인스턴스 사이에서도). */
const WRITE_LOCK_KEY = 74_201_001;

export interface PgBackend {
  storage: Storage;
  lock: Lock;
  publisher: ChangePublisher;
  migrate(): Promise<void>;
}

export function createPgBackend(db: SqlDatabase): PgBackend {
  /** 잠금 안에서는 그 트랜잭션의 연결로 읽고 써서, 읽은 뒤 쓰기 전까지 다른 쓰기가 끼어들지 못합니다. */
  const current = new AsyncLocalStorage<SqlExecutor>();
  const exec = (): SqlExecutor => current.getStore() ?? db;

  async function applyOps(tx: SqlExecutor, ops: WriteOp[]): Promise<void> {
    // 같은 저장소의 put은 묶어서 한 번에 넣습니다(시드처럼 수백 건일 때 왕복을 줄임).
    let batch: { store: StoreName; ids: string[]; data: string[] } | null = null;
    const flush = async () => {
      if (!batch || batch.ids.length === 0) return;
      await tx.query(
        `insert into docs (store, id, data)
         select $1, u.id, u.data::jsonb from unnest($2::text[], $3::text[]) as u(id, data)
         on conflict (store, id) do update set data = excluded.data`,
        [batch.store, batch.ids, batch.data],
      );
      batch = null;
    };
    for (const op of ops) {
      if ('put' in op) {
        if (batch && batch.store !== op.store) await flush();
        batch ??= { store: op.store, ids: [], data: [] };
        batch.ids.push(op.put.id);
        batch.data.push(JSON.stringify(op.put));
        continue;
      }
      await flush();
      if ('delete' in op)
        await tx.query('delete from docs where store = $1 and id = $2', [op.store, op.delete]);
      else await tx.query('delete from docs where store = $1', [op.store]);
    }
    await flush();
  }

  const storage: Storage = {
    async get<T>(store: StoreName, id: string) {
      const { rows } = await exec().query<{ data: T }>(
        'select data from docs where store = $1 and id = $2',
        [store, id],
      );
      return rows[0]?.data;
    },
    async all<T>(store: StoreName) {
      const { rows } = await exec().query<{ data: T }>('select data from docs where store = $1', [
        store,
      ]);
      return rows.map((row) => row.data);
    },
    async write(ops) {
      if (ops.length === 0) return;
      const tx = current.getStore();
      // 잠금 안이면 이미 트랜잭션 중이고, 밖이면(충돌 기록 등) 따로 트랜잭션을 엽니다.
      if (tx) await applyOps(tx, ops);
      else await db.transaction((own) => applyOps(own, ops));
    },
    close() {
      void db.close();
    },
  };

  const lock: Lock = (work) =>
    db.transaction(async (tx) => {
      await tx.query('select pg_advisory_xact_lock($1)', [WRITE_LOCK_KEY]);
      return current.run(tx, work);
    });

  const publisher: ChangePublisher = {
    async publish(event: ChangeEvent) {
      await exec().query(
        'insert into events (origin, by_user, topics, message) values ($1, $2, $3, $4)',
        [event.origin, event.by, event.topics, event.message],
      );
    },
    // 서버에는 상주 구독자가 없습니다. 클라이언트가 /api/changes로 이어 받습니다.
    subscribe: () => () => undefined,
    close: () => undefined,
  };

  return {
    storage,
    lock,
    publisher,
    async migrate() {
      for (const statement of SCHEMA.split(';')
        .map((s) => s.trim())
        .filter(Boolean)) {
        await db.query(statement);
      }
    },
  };
}
