import { PGlite } from '@electric-sql/pglite';
import { LOCAL_AUTH_SECRET } from '@sog/wms-server';
import { type ApiHandler, createApiHandler } from './api';
import { fromPglite } from './sql';

/** 로컬 미리보기·E2E용 실제 서버. 메모리 안의 Postgres(PGlite)를 씁니다. 계정이나 Docker가 필요 없습니다. */
export async function createLocalApi(): Promise<ApiHandler> {
  const db = await PGlite.create();
  // 로컬 미리보기·E2E는 데모 모드와 같은 고정 키를 씁니다(운영은 AUTH_SECRET).
  return createApiHandler(fromPglite(db), {
    authSecret: LOCAL_AUTH_SECRET,
    cronSecret: 'local-cron',
  });
}
