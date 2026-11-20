import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import type { StoreName } from '@sog/wms-server';
import { createPgBackend } from './pg-backend';
import { fromPglite, type SqlDatabase } from './sql';

describe('Postgres 저장 계층', () => {
  it('저장소의 모든 문서를 행 하나(배열)로 받고, 빈 저장소는 빈 배열이다', async () => {
    const base = fromPglite(await PGlite.create());
    // Workers의 pg 드라이버는 행마다 처리 비용이 커서, 문서 수와 상관없이 행 하나로 받는지 셉니다.
    const received: number[] = [];
    const db: SqlDatabase = {
      ...base,
      async query<R = Record<string, unknown>>(text: string, params?: unknown[]) {
        const result = await base.query<R>(text, params);
        if (text.trim().startsWith('select')) received.push(result.rows.length);
        return result;
      },
    };
    const backend = createPgBackend(db);
    await backend.migrate();
    const docs = Array.from({ length: 300 }, (_, i) => ({ id: `mv-${i}`, at: `t${i}`, qty: i }));
    await backend.storage.write(docs.map((put) => ({ store: 'movements', put })));

    received.length = 0;
    const all = await backend.storage.all<{ id: string; qty: number }>('movements');
    expect(all).toHaveLength(300);
    expect(all.map((doc) => doc.qty).sort((a, b) => a - b)).toEqual(docs.map((doc) => doc.qty));
    expect(received).toEqual([1]);

    expect(await backend.storage.all('activity')).toEqual([]);
    await db.close();
  });

  it('같은 순간에 읽는 여러 저장소는 쿼리 하나로 묶고, 각자 고칠 수 있는 배열을 받는다', async () => {
    const base = fromPglite(await PGlite.create());
    const selects: string[] = [];
    const db: SqlDatabase = {
      ...base,
      async query<R = Record<string, unknown>>(text: string, params?: unknown[]) {
        if (text.includes('from docs')) selects.push(text);
        return base.query<R>(text, params);
      },
      transaction: (work) =>
        base.transaction((tx) =>
          work({
            query: (text, params) => {
              if (text.includes('from docs')) selects.push(text);
              return tx.query(text, params);
            },
          }),
        ),
    };
    const backend = createPgBackend(db);
    await backend.migrate();
    const seed: [store: StoreName, doc: { id: string; [field: string]: unknown }][] = [
      ['skus', { id: 'sku-1', name: '가' }],
      ['skus', { id: 'sku-2', name: '나' }],
      ['stocks', { id: 'st-1', onHand: 3 }],
    ];
    await backend.storage.write(seed.map(([store, put]) => ({ store, put })));

    // 운영 Worker는 쿼리마다, 동시에 여는 연결마다 CPU가 들어 Promise.all로 읽는 저장소를 묶습니다.
    selects.length = 0;
    const [skus, stocks, empty, again] = await Promise.all([
      backend.storage.all<{ id: string; name: string }>('skus'),
      backend.storage.all('stocks'),
      backend.storage.all('activity'),
      backend.storage.all<{ id: string; name: string }>('skus'),
    ]);
    expect(selects).toHaveLength(1);
    expect(skus.map((sku) => sku.id).sort()).toEqual(['sku-1', 'sku-2']);
    expect(stocks).toEqual([{ id: 'st-1', onHand: 3 }]);
    expect(empty).toEqual([]);
    // 같은 저장소를 함께 읽은 곳끼리 배열을 나눠 쓰지 않습니다.
    skus[0]!.name = '바뀜';
    expect(again.map((sku) => sku.name).sort()).toEqual(['가', '나']);

    // 차례로 읽으면 지금처럼 따로 묻습니다.
    selects.length = 0;
    await backend.storage.all('skus');
    await backend.storage.all('stocks');
    expect(selects).toHaveLength(2);

    // 쓰기 잠금(트랜잭션) 안에서도 그 트랜잭션의 연결로 묶어 읽습니다.
    selects.length = 0;
    const inLock = await backend.lock(() =>
      Promise.all([backend.storage.all('skus'), backend.storage.all('stocks')]),
    );
    expect(selects).toHaveLength(1);
    expect(inLock.map((docs) => docs.length)).toEqual([2, 1]);
    await db.close();
  });
});
