import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import type { OrderDetail } from '@sog/domain';
import { Presence, WmsHost } from '@/shared/api';
import { AgoPipe, DateTimePipe, NumPipe } from '@/shared/lib';
import { PageHeader, StateMessage } from '@/shared/ui';
import { CountProgress } from '@/entities/count';
import { OrderStatusBadge } from '@/entities/order';
import { UserNamePipe } from '@/entities/user';
import { PresenceNotice } from '@/features/show-presence';
import { OrderActions } from '@/features/ship-order';

@Component({
  selector: 'sog-order-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AgoPipe,
    DateTimePipe,
    NumPipe,
    PageHeader,
    StateMessage,
    CountProgress,
    OrderStatusBadge,
    UserNamePipe,
    PresenceNotice,
    OrderActions,
  ],
  templateUrl: './order-detail-page.html',
  styleUrl: './order-detail-page.css',
})
export class OrderDetailPage {
  readonly orderId = input.required<string>();
  protected readonly detail = httpResource<OrderDetail>(
    () => `/api/orders/${encodeURIComponent(this.orderId())}`,
  );
  protected readonly data = linkedSignal<OrderDetail | undefined, OrderDetail | undefined>({
    source: () => (this.detail.hasValue() ? this.detail.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });

  constructor() {
    inject(Presence).track(() => `orders/${this.orderId()}`);
    const title = inject(Title);
    effect(() => {
      const order = this.data()?.order;
      if (order) title.setTitle(`${order.code} ${order.customer} · 출고 지시 · SoG 백오피스`);
    });
    inject(WmsHost).onChange(['*', 'orders'], (event) => {
      if (event.topics.includes('*') || event.topics.includes(`orders/${this.orderId()}`))
        this.detail.reload();
    });
  }
}
