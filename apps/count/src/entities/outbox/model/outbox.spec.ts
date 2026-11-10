import { TestBed } from '@angular/core/testing';
import type { CountTaskDetail } from '@sog/domain';
import { createWmsServer, type WmsServer } from '@sog/wms-server';
import { NetworkState, provideWmsClient } from '@/shared/api';
import { LOCAL_DB_NAME } from '@/shared/lib';
import { Outbox } from './outbox';

async function until(check: () => boolean, timeout = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('시간 안에 조건을 만족하지 못했습니다.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('Outbox', () => {
  let admin: WmsServer;
  let outbox: Outbox;
  let network: NetworkState;

  beforeEach(async () => {
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
    const detail = (await admin.handle({ method: 'GET', url: '/api/counts/ct-003', headers: {} }))
      .body as CountTaskDetail;
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

    const after = (await admin.handle({ method: 'GET', url: '/api/counts/ct-003', headers: {} }))
      .body as CountTaskDetail;
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

  it('보내기 전에 관리자가 재실사를 요청했으면 덮어쓰지 않고 충돌로 남긴다', async () => {
    network.simulatedOffline.set(true);
    const line = await firstLine('counted');
    await outbox.enqueue(item(line, 1));

    await admin.handle({
      method: 'POST',
      url: `/api/counts/ct-003/lines/${line.id}/recount`,
      headers: { 'If-Match': `"${line.version}"` },
    });

    network.simulatedOffline.set(false);
    TestBed.tick();
    await until(() => outbox.conflicts().length === 1);
    expect(outbox.conflicts()[0]!.message).toContain('다시 세도록');
  });
});
