import { TestBed } from '@angular/core/testing';
import type { CountTaskDetail } from '@sog/domain';
import { createWmsServer, issueToken, LOCAL_AUTH_SECRET, type WmsServer } from '@sog/wms-server';
import { AuthSession, NetworkState, provideWmsClient, seedTestSession } from '@/shared/api';
import { LOCAL_DB_NAME } from '@/shared/lib';
import { TaskRepository } from './task-repository';

async function auth(userId: string): Promise<Record<string, string>> {
  const { token } = await issueToken(LOCAL_AUTH_SECRET, userId, Math.floor(Date.now() / 1000));
  return { Authorization: `Bearer ${token}` };
}

describe('TaskRepository 사본 먼저 보여 주기', () => {
  let admin: WmsServer;
  let repo: TaskRepository;
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
    repo = TestBed.inject(TaskRepository);
    network = TestBed.inject(NetworkState);
  });

  afterEach(() => {
    admin.close();
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });

  /** 관리자(다른 기기)가 작업의 첫 항목을 다시 세도록 요청해 서버 내용을 바꿉니다. */
  async function changeOnServer(): Promise<string> {
    const headers = await auth('u-kim');
    const detail = (await admin.handle({ method: 'GET', url: '/api/counts/ct-003', headers }))
      .body as CountTaskDetail;
    const line = detail.lines.find((l) => l.status === 'counted')!;
    const response = await admin.handle({
      method: 'POST',
      url: `/api/counts/ct-003/lines/${line.id}/recount`,
      headers: { ...headers, 'If-Match': `"${line.version}"` },
    });
    expect(response.status).toBe(200);
    return line.id;
  }

  it('처음에는 네트워크를 기다리고, 다음부터는 사본을 바로 내보낸 뒤 새 내용으로 바꾼다', async () => {
    const first = await repo.watchDetail('ct-003');
    const initial = first();
    expect('value' in initial && initial.value.fromCache).toBe(false);

    const lineId = await changeOnServer();
    const second = await repo.watchDetail('ct-003');
    // 바로 내보낸 사본: 아직 바뀌기 전의 상태이고 오프라인 안내는 붙지 않습니다.
    const copy = second();
    expect('value' in copy && copy.value.fromCache).toBe(false);
    expect('value' in copy && copy.value.data.lines.find((l) => l.id === lineId)!.status).toBe(
      'counted',
    );
    await vi.waitFor(() => {
      const item = second();
      expect('value' in item && item.value.data.lines.find((l) => l.id === lineId)!.status).toBe(
        'recount',
      );
    });
  });

  it('연결이 끊겼으면 같은 사본에 오프라인 안내를 붙인다', async () => {
    await repo.watchDetail('ct-003');
    network.simulatedOffline.set(true);
    const stream = await repo.watchDetail('ct-003');
    await vi.waitFor(() => {
      const item = stream();
      expect('value' in item && item.value.fromCache).toBe(true);
    });
  });

  it('사본이 있어도 네트워크가 아닌 오류(로그인 만료 등)는 그대로 알린다', async () => {
    await repo.watchDetail('ct-003');
    TestBed.inject(AuthSession).logout();
    const stream = await repo.watchDetail('ct-003');
    await vi.waitFor(() => expect('error' in stream()).toBe(true));
  });

  it('사본이 없으면 없는 작업은 오류로 알린다', async () => {
    const stream = await repo.watchDetail('ct-missing');
    expect('error' in stream()).toBe(true);
  });
});
