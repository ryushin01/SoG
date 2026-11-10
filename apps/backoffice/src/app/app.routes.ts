import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: '운영 현황',
    loadComponent: () => import('@/pages/dashboard').then((m) => m.DashboardPage),
  },
  {
    path: 'inventory',
    title: '재고',
    loadComponent: () => import('@/pages/inventory').then((m) => m.InventoryPage),
  },
  {
    path: 'inventory/:skuId',
    title: '품목 상세',
    loadComponent: () => import('@/pages/sku-detail').then((m) => m.SkuDetailPage),
  },
  {
    path: 'counts',
    title: '재고 실사',
    loadComponent: () => import('@/pages/counts').then((m) => m.CountsPage),
  },
  {
    path: 'counts/:taskId',
    title: '실사 작업',
    loadComponent: () => import('@/pages/count-detail').then((m) => m.CountDetailPage),
  },
  {
    path: 'map',
    title: '창고 도면',
    loadComponent: () => import('@/pages/warehouse-map').then((m) => m.WarehouseMapPage),
  },
  {
    path: 'activity',
    title: '활동 기록',
    loadComponent: () => import('@/pages/activity').then((m) => m.ActivityPage),
  },
  {
    path: '**',
    title: '페이지를 찾을 수 없음',
    loadComponent: () => import('@/pages/not-found').then((m) => m.NotFoundPage),
  },
];
