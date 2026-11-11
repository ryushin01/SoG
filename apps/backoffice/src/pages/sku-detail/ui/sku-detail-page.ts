import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import {
  available,
  CATEGORY_LABEL,
  type HistoryEntry,
  type SkuDetail,
  type StockWithLocation,
} from '@sog/domain';
import { WmsHost } from '@/shared/api';
import { DateTimePipe, NumPipe, WonPipe } from '@/shared/lib';
import { Dialog, PageHeader, StateMessage } from '@/shared/ui';
import { LocationDirectory } from '@/entities/location';
import { MovementTypeBadge } from '@/entities/movement';
import { SkuArt, StockStatusBadge } from '@/entities/sku';
import { UserNamePipe } from '@/entities/user';
import { AdjustStockForm } from '@/features/adjust-stock';
import { EditSkuForm, type SkuModel } from '@/features/edit-sku';
import { HistoryTimeline } from './history-timeline';
import { MovementForm } from '@/features/record-movement';
import { PresenceNotice } from '@/features/show-presence';

@Component({
  selector: 'sog-sku-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DateTimePipe,
    NumPipe,
    WonPipe,
    Dialog,
    PageHeader,
    StateMessage,
    MovementTypeBadge,
    SkuArt,
    StockStatusBadge,
    UserNamePipe,
    AdjustStockForm,
    EditSkuForm,
    MovementForm,
    PresenceNotice,
    HistoryTimeline,
  ],
  templateUrl: './sku-detail-page.html',
  styleUrl: './sku-detail-page.css',
})
export class SkuDetailPage {
  readonly skuId = input.required<string>();
  private readonly host = inject(WmsHost);
  protected readonly directory = inject(LocationDirectory);

  protected readonly detail = httpResource<SkuDetail>(() => `/api/skus/${this.skuId()}`);
  protected readonly data = linkedSignal<SkuDetail | undefined, SkuDetail | undefined>({
    source: () => (this.detail.hasValue() ? this.detail.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });
  protected readonly totals = computed(() => {
    const stocks = this.data()?.stocks ?? [];
    const onHand = stocks.reduce((sum, s) => sum + s.onHand, 0);
    const reserved = stocks.reduce((sum, s) => sum + s.reserved, 0);
    return { onHand, reserved, available: available(onHand, reserved) };
  });
  protected readonly history = httpResource<{ items: HistoryEntry[] }>(
    () => `/api/skus/${encodeURIComponent(this.skuId())}/history`,
  );
  protected readonly historyItems = computed(() =>
    this.history.hasValue() ? this.history.value().items : [],
  );
  /** 변경 이력에서 수정 폼으로 불러올 값 */
  protected readonly restore = signal<{ values: Partial<SkuModel>; label: string } | null>(null);
  protected readonly adjusting = signal<StockWithLocation | null>(null);
  protected readonly movementOpen = signal(false);
  protected readonly categoryLabel = CATEGORY_LABEL;

  constructor() {
    const title = inject(Title);
    effect(() => {
      const sku = this.data()?.sku;
      if (sku) title.setTitle(`${sku.name} · 재고 · SoG 백오피스`);
    });
    this.host.onChange(['*', 'skus'], (event) => {
      if (event.topics.includes('*') || event.topics.includes(`skus/${this.skuId()}`)) {
        this.detail.reload();
        this.history.reload();
      }
    });
  }

  protected free(stock: StockWithLocation): number {
    return available(stock.onHand, stock.reserved);
  }

  /** 일반 기록은 바뀌기 전 값을, 막힌 시도는 그때 시도한 값을 폼에 불러옵니다. */
  protected restoreFrom(entry: HistoryEntry): void {
    const values: Partial<Record<keyof SkuModel, unknown>> = {};
    for (const change of entry.changes) {
      const value = entry.blocked ? change.after : change.before;
      // 빈 값은 불러오지 않습니다. 숫자 칸에 null이 들어가 0으로 보이는 일을 막습니다.
      if (value === null || value === undefined) continue;
      values[change.field as keyof SkuModel] = value;
    }
    this.restore.set({
      values: values as Partial<SkuModel>,
      label: entry.blocked ? '막힌 시도의' : '이전',
    });
    // 불러온 값을 바로 확인하도록 수정 폼 제목으로 초점을 옮깁니다(초점 이동이 스크롤도 함께 합니다).
    const title = document.getElementById('edit-sku-title');
    if (title) {
      title.tabIndex = -1;
      title.focus();
    }
  }
}
