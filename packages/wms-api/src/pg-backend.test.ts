import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
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
});
