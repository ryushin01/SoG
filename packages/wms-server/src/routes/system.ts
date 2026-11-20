/** 기준 정보·로그인·운영 현황·창고 도면·활동 기록·데모 초기화 */
import { check, type Activity, type LoginResponse } from '@sog/domain';
import { loginRequestSchema } from '@sog/domain/requests';
import { DEMO_PASSWORD, issueToken } from '../auth';
import { intParam, json, MAX_LIST_LIMIT } from '../core/http';
import type { ServerScope } from '../core/scope';
import { HttpError, type Route } from '../core/types';
import { zonesIn, type Views } from '../core/views';

export function systemRoutes(scope: ServerScope, views: Views): Route[] {
  const { authSecret, db, emit, load, lock, now, nowSeconds, writeSeed } = scope;
  const { dashboard, locationDetail, locationOverview } = views;

  return [
    [
      'GET',
      '/api/reference',
      async () => {
        const locations = await load.locations();
        return json(200, { zones: zonesIn(locations), locations, users: await load.users() });
      },
    ],
    [
      'POST',
      '/api/auth/login',
      async (ctx) => {
        const login = check(loginRequestSchema(), ctx.body);
        const user = login.ok
          ? (await load.users()).find((u) => u.id === login.value.userId)
          : undefined;
        // 데모 계정의 비밀번호는 공개 값입니다(로그인 화면에 안내). 본문이 맞지 않거나 계정이 없거나 틀리면 같은 문구로 답합니다.
        if (!login.ok || !user || login.value.password !== DEMO_PASSWORD) {
          throw new HttpError(401, 'UNAUTHENTICATED', '계정이나 비밀번호가 맞지 않습니다.');
        }
        const { token, expiresAt } = await issueToken(authSecret, user.id, nowSeconds());
        return json(200, { token, expiresAt, user } satisfies LoginResponse);
      },
    ],
    ['GET', '/api/dashboard', async () => json(200, await dashboard())],
    ['GET', '/api/locations/overview', async () => json(200, { items: await locationOverview() })],
    ['GET', '/api/locations/:id', async (_ctx, { id }) => json(200, await locationDetail(id!))],
    [
      'GET',
      '/api/activity',
      async (ctx) => {
        const limit = intParam(ctx.query.get('limit'), 20, 1, MAX_LIST_LIMIT);
        // 종류는 묶음으로 거릅니다: count는 count.created·count.line …, order는 order.* 모두.
        const kind = ctx.query.get('kind');
        const by = ctx.query.get('by');
        const matched = (await db.all<Activity>('activity'))
          .filter(
            (item) =>
              (!kind || item.kind === kind || item.kind.startsWith(`${kind}.`)) &&
              (!by || item.by === by),
          )
          .sort((a, b) => b.at.localeCompare(a.at));
        return json(200, { items: matched.slice(0, limit), total: matched.length });
      },
    ],
    [
      'POST',
      '/api/_reset',
      async (ctx) =>
        lock(async () => {
          await writeSeed();
          await emit({
            topics: ['*'],
            by: ctx.user.id,
            at: now().toISOString(),
            origin: ctx.origin,
            message: '데모 데이터를 초기화했습니다.',
          });
          return json(204, null);
        }),
    ],
  ];
}
