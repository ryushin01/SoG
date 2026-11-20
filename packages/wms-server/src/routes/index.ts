/** 라우트 모음과 접근 권한 */
import type { Mutate } from '../core/mutate';
import type { ServerScope } from '../core/scope';
import type { Route } from '../core/types';
import type { Views } from '../core/views';
import { countRoutes } from './counts';
import { orderRoutes } from './orders';
import { skuRoutes } from './skus';
import { systemRoutes } from './system';

/**
 * 모든 라우트. 경로 길이와 고정 부분이 같으면 먼저 놓인 것이 이기므로(예: 창고 도면의 /overview가 /:id보다 먼저),
 * 겹치는 경로는 한 모듈 안에서 순서를 지킵니다.
 */
export function createRoutes(scope: ServerScope, views: Views, mutate: Mutate): Route[] {
  return [
    ...systemRoutes(scope, views),
    ...skuRoutes(scope, views, mutate),
    ...countRoutes(scope, views, mutate),
    ...orderRoutes(scope, views, mutate),
  ];
}

/** 로그인 없이 부를 수 있는 라우트. 로그인 화면이 계정 목록을 보여 주려고 기준 정보를 씁니다. */
export const PUBLIC_ROUTES = new Set(['POST /api/auth/login', 'GET /api/reference']);

/** 관리자만 부를 수 있는 라우트. 작업자는 배정된 실사·피킹만 합니다(처리기에서 담당자 확인). */
export const MANAGER_ROUTES = new Set([
  'PATCH /api/skus/:id',
  'POST /api/stocks/:id/adjust',
  'POST /api/movements',
  'POST /api/counts',
  'POST /api/counts/:id/cancel',
  'POST /api/counts/:id/approve',
  'POST /api/counts/:id/lines/:lineId/recount',
  'POST /api/orders',
  'POST /api/orders/:id/ship',
  'POST /api/orders/:id/cancel',
  'POST /api/_reset',
]);
