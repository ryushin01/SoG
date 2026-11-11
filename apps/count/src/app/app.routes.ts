import type { Routes } from '@angular/router';
import { operatorGuard } from './operator.guard';

export const routes: Routes = [
  {
    path: 'start',
    title: '작업자 선택',
    loadComponent: () => import('@/pages/start').then((m) => m.StartPage),
  },
  {
    path: '',
    canActivate: [operatorGuard],
    children: [
      {
        path: '',
        title: '내 실사 작업',
        loadComponent: () => import('@/pages/tasks').then((m) => m.TasksPage),
      },
      {
        path: 'tasks/:taskId',
        title: '실사 작업',
        loadComponent: () => import('@/pages/task').then((m) => m.TaskPage),
      },
      {
        path: 'tasks/:taskId/lines/:lineId',
        title: '품목 실사',
        loadComponent: () => import('@/pages/line').then((m) => m.LinePage),
      },
      {
        path: 'picks',
        title: '피킹',
        loadComponent: () => import('@/pages/picks').then((m) => m.PicksPage),
      },
      {
        path: 'picks/:orderId',
        title: '피킹',
        loadComponent: () => import('@/pages/pick').then((m) => m.PickPage),
      },
      {
        path: 'settings',
        title: '보낼함·설정',
        loadComponent: () => import('@/pages/settings').then((m) => m.SettingsPage),
      },
    ],
  },
  {
    path: '**',
    title: '페이지를 찾을 수 없음',
    loadComponent: () => import('@/pages/not-found').then((m) => m.NotFoundPage),
  },
];
