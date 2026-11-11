import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  ORDER_STATUS_LABEL,
  type OrderStatus,
  type OrderSummary,
  type ShipmentOrder,
} from '@sog/domain';
import { WmsHost } from '@/shared/api';
import { DateTimePipe, NumPipe } from '@/shared/lib';
import { Dialog, PageHeader, StateMessage } from '@/shared/ui';
import { CountProgress } from '@/entities/count';
import { OrderStatusBadge } from '@/entities/order';
import { CreateOrderForm } from '@/features/create-order';

type Filter = OrderStatus | 'open' | 'all';

@Component({
  selector: 'sog-orders-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DateTimePipe,
    NumPipe,
    Dialog,
    PageHeader,
    StateMessage,
    CountProgress,
    OrderStatusBadge,
    CreateOrderForm,
  ],
  templateUrl: './orders-page.html',
  styleUrl: './orders-page.css',
})
export class OrdersPage {
  private readonly router = inject(Router);
  protected readonly filters: { value: Filter; label: string }[] = [
    { value: 'open', label: '진행 중' },
    ...(Object.entries(ORDER_STATUS_LABEL) as [OrderStatus, string][]).map(([value, label]) => ({
      value,
      label,
    })),
    { value: 'all', label: '전체' },
  ];
  protected readonly filter = signal<Filter>('open');
  protected readonly createOpen = signal(false);

  protected readonly list = httpResource<{ items: OrderSummary[] }>(() => ({
    url: '/api/orders',
    params: {
      status:
        this.filter() === 'all'
          ? ''
          : this.filter() === 'open'
            ? 'reserved,picking,picked'
            : this.filter(),
    },
  }));
  protected readonly items = linkedSignal<
    { items: OrderSummary[] } | undefined,
    OrderSummary[] | undefined
  >({
    source: () => (this.list.hasValue() ? this.list.value() : undefined),
    computation: (value, previous) => value?.items ?? previous?.value,
  });

  constructor() {
    inject(WmsHost).onChange(['*', 'orders'], () => this.list.reload());
  }

  protected created(order: ShipmentOrder): void {
    this.createOpen.set(false);
    void this.router.navigate(['/orders', order.id]);
  }

  protected overdue(order: OrderSummary): boolean {
    return (
      order.status !== 'shipped' &&
      order.status !== 'cancelled' &&
      new Date(order.dueAt).getTime() < Date.now()
    );
  }
}
