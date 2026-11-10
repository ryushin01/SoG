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
import { available, CATEGORY_LABEL, type SkuDetail, type StockWithLocation } from '@sog/domain';
import { WmsHost } from '@/shared/api';
import { DateTimePipe, NumPipe, WonPipe } from '@/shared/lib';
import { Dialog, PageHeader, StateMessage } from '@/shared/ui';
import { LocationDirectory } from '@/entities/location';
import { MovementTypeBadge } from '@/entities/movement';
import { SkuArt, StockStatusBadge } from '@/entities/sku';
import { UserNamePipe } from '@/entities/user';
import { AdjustStockForm } from '@/features/adjust-stock';
import { EditSkuForm } from '@/features/edit-sku';
import { MovementForm } from '@/features/record-movement';

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
      if (event.topics.includes('*') || event.topics.includes(`skus/${this.skuId()}`))
        this.detail.reload();
    });
  }

  protected free(stock: StockWithLocation): number {
    return available(stock.onHand, stock.reserved);
  }
}
