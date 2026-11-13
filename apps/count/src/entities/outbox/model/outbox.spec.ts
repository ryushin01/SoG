import { TestBed } from '@angular/core/testing';
import type { CountTaskDetail } from '@sog/domain';
import { createWmsServer, issueToken, LOCAL_AUTH_SECRET, type WmsServer } from '@sog/wms-server';
import { NetworkState, provideWmsClient, seedTestSession } from '@/shared/api';
import { LOCAL_DB_NAME } from '@/shared/lib';
import { Outbox } from './outbox';

async function until(check: () => boolean, timeout = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('시간 안에 조건을 만족하지 못했습니다.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** 서버를 직접 부를 때 붙이는 로그인 헤더 */
async function auth(userId: string): Promise<Record<string, string>> {
  const { token } = await issueToken(LOCAL_AUTH_SECRET, userId, Math.floor(Date.now() / 1000));
  return { Authorization: `Bearer ${token}` };
}

describe('Outbox', () => {
  let admin: WmsServer;
  let outbox: Outbox;
  let network: NetworkState;

  beforeEach(async () => {
    await seedTestSession(
      { id: 'u-lee', name: '이서준', role: 'operator', team: '실사 1조' },
      'session',
    );
    const dbName = `count-${crypto.randomUUID()}`;
    admin = await createWmsServer({ dbName });
    TestBed.configureTestingModule({
      providers: [
        provideWmsClient({ dbName, latency: [0, 0] }),
        { provide: LOCAL_DB_NAME, useValue: `local-${crypto.randomUUID()}` },
      ],
    });
    network = TestBed.inject(NetworkState);
    outbox = TestBed.inject(Outbox);
    await until(() => outbox.ready());
  });

  afterEach(() => admin.close());

  async function firstLine(status: 'pending' | 'counted') {
    const detail = (
      await admin.handle({ method: 'GET', url: '/api/counts/ct-003', headers: await auth('u-kim') })
    ).body as CountTaskDetail;
    return detail.lines.find((line) => line.status === status)!;
  }

  function item(line: Awaited<ReturnType<typeof firstLine>>, countedQty: number) {
    return {
      taskId: line.taskId,
      lineId: line.id,
      skuName: line.sku.name,
      locationCode: line.location.code,
      baseVersion: line.version,
      countedQty,
      note: '',
    };
  }

  it('오프라인에서는 기기에 쌓아 두고, 연결되면 서버로 보낸다', async () => {
    network.simulatedOffline.set(true);
    const line = await firstLine('pending');

    await outbox.enqueue(item(line, 7));
    expect(outbox.waiting()).toHaveLength(1);

    network.simulatedOffline.set(false);
    TestBed.tick();
    await until(() => outbox.items().length === 0);

    const after = (
      await admin.handle({ method: 'GET', url: '/api/counts/ct-003', headers: await auth('u-kim') })
    ).body as CountTaskDetail;
    expect(after.lines.find((l) => l.id === line.id)!.countedQty).toBe(7);
  });

  it('같은 줄을 다시 세면 보내지 않은 기록을 바꾼다', async () => {
    network.simulatedOffline.set(true);
    const line = await firstLine('pending');
    await outbox.enqueue(item(line, 3));
    await outbox.enqueue(item(line, 4));
    expect(outbox.items()).toHaveLength(1);
    expect(outbox.items()[0]!.countedQty).toBe(4);
  });

  it('다시 센 기록을 기기에 쓰지 못하면 이전 기록을 그대로 남긴다', async () => {
    network.simulatedOffline.set(true);
    const line = await firstLine('pending');
    const first = await outbox.enqueue(item(line, 3));
    const store = (outbox as unknown as { store: { replace: () => Promise<void> } }).store;
    const spy = vi.spyOn(store, 'replace').mockRejectedValueOnce(new Error('QuotaExceededError'));

    await expect(outbox.enqueue(item(line, 9))).rejects.toThrow();
    expect(outbox.items().map((i) => [i.id, i.countedQty])).toEqual([[first.id, 3]]);
    spy.mockRestore();
  });

  it('보내기 전에 관리자가 재실사를 요청했으면 덮어쓰지 않고 충돌로 남긴다', async () => {
    network.simulatedOffline.set(true);
    const line = await firstLine('counted');
    await outbox.enqueue(item(line, 1));

    await admin.handle({
      method: 'POST',
      url: `/api/counts/ct-003/lines/${line.id}/recount`,
      headers: { ...(await auth('u-kim')), 'If-Match': `"${line.version}"` },
    });

    network.simulatedOffline.set(false);
    TestBed.tick();
    await until(() => outbox.conflicts().length === 1);
    expect(outbox.conflicts()[0]!.message).toContain('다시 세도록');
  });
});
