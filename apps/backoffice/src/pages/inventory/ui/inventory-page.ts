import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  debounced,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  CATEGORY_LABEL,
  type Page,
  type SkuCategory,
  type SkuSort,
  type SkuSummary,
  STOCK_STATUS_LABEL,
  type StockStatus,
  type ZoneCode,
} from '@sog/domain';
import { WmsHost } from '@/shared/api';
import { AgoPipe, NumPipe, WonPipe } from '@/shared/lib';
import { Dialog, PageHeader, Pagination, StateMessage } from '@/shared/ui';
import { LocationDirectory } from '@/entities/location';
import { SkuArt, StockStatusBadge } from '@/entities/sku';
import { MovementForm } from '@/features/record-movement';

const SIZE = 15;

@Component({
  selector: 'sog-inventory-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AgoPipe,
    NumPipe,
    WonPipe,
    Dialog,
    PageHeader,
    Pagination,
    StateMessage,
    SkuArt,
    StockStatusBadge,
    MovementForm,
  ],
  templateUrl: './inventory-page.html',
  styleUrl: './inventory-page.css',
})
export class InventoryPage {
  /** 쿼리 문자열(?q=&status=…)과 연결된 입력. 대시보드의 "부족·품절" 링크가 여기로 옵니다. */
  readonly q = input<string>('');
  readonly status = input<string>('');
  readonly category = input<string>('');
  readonly zone = input<string>('');

  private readonly router = inject(Router);
  protected readonly directory = inject(LocationDirectory);
  protected readonly categories = Object.entries(CATEGORY_LABEL) as [SkuCategory, string][];
  protected readonly statuses = Object.entries(STOCK_STATUS_LABEL) as [StockStatus, string][];

  protected readonly qFilter = linkedSignal(() => this.q() ?? '');
  protected readonly statusFilter = linkedSignal(() => (this.status() ?? '') as StockStatus | '');
  protected readonly categoryFilter = linkedSignal(
    () => (this.category() ?? '') as SkuCategory | '',
  );
  protected readonly zoneFilter = linkedSignal(() => (this.zone() ?? '') as ZoneCode | '');
  protected readonly sort = signal<SkuSort>('code');
  protected readonly dir = signal<'asc' | 'desc'>('asc');
  protected readonly page = signal(1);
  protected readonly movementOpen = signal(false);

  /** 글자를 칠 때마다 요청하지 않도록 0.3초 기다립니다. 이전 요청은 httpResource가 취소합니다. */
  private readonly qDebounced = debounced(() => this.qFilter(), 300);

  protected readonly list = httpResource<Page<SkuSummary>>(() => ({
    url: '/api/skus',
    params: {
      q: this.qDebounced.value() ?? '',
      status: this.statusFilter(),
      category: this.categoryFilter(),
      zone: this.zoneFilter(),
      sort: this.sort(),
      dir: this.dir(),
      page: this.page(),
      size: SIZE,
    },
  }));
  protected readonly rows = linkedSignal<
    Page<SkuSummary> | undefined,
    Page<SkuSummary> | undefined
  >({
    source: () => (this.list.hasValue() ? this.list.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });
  protected readonly size = SIZE;
  protected readonly filtered = computed(
    () => !!(this.qFilter() || this.statusFilter() || this.categoryFilter() || this.zoneFilter()),
  );

  protected readonly columns: { key: SkuSort; label: string; numeric: boolean }[] = [
    { key: 'name', label: '품목', numeric: false },
    { key: 'onHand', label: '보유', numeric: true },
    { key: 'available', label: '가용', numeric: true },
    { key: 'value', label: '재고 금액', numeric: true },
    { key: 'updatedAt', label: '최근 수정', numeric: false },
  ];

  constructor() {
    inject(WmsHost).onChange(['*', 'skus'], () => this.list.reload());
    // 필터를 바꾸면 첫 페이지로 가고, 주소에도 남겨 새로 고침·뒤로 가기 때 유지합니다.
    effect(() => {
      const queryParams = {
        q: this.qDebounced.value() || null,
        status: this.statusFilter() || null,
        category: this.categoryFilter() || null,
        zone: this.zoneFilter() || null,
      };
      this.page.set(1);
      void this.router.navigate([], { queryParams, replaceUrl: true });
    });
  }

  protected sortBy(key: SkuSort): void {
    if (this.sort() === key) {
      this.dir.set(this.dir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sort.set(key);
      this.dir.set(key === 'name' || key === 'code' ? 'asc' : 'desc');
    }
  }

  protected ariaSort(key: SkuSort): 'ascending' | 'descending' | null {
    if (this.sort() !== key) return null;
    return this.dir() === 'asc' ? 'ascending' : 'descending';
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected reset(): void {
    this.qFilter.set('');
    this.statusFilter.set('');
    this.categoryFilter.set('');
    this.zoneFilter.set('');
  }

  protected categoryLabel(category: SkuCategory): string {
    return CATEGORY_LABEL[category];
  }
}
