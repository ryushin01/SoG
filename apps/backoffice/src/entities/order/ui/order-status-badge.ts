import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@sog/domain';

const TONE: Record<OrderStatus, string> = {
  reserved: 'badge--neutral',
  picking: 'badge--info',
  picked: 'badge--warn',
  shipped: 'badge--ok',
  cancelled: 'badge--neutral',
};

@Component({
  selector: 'sog-order-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="tone()">{{ label() }}</span>`,
})
export class OrderStatusBadge {
  readonly status = input.required<OrderStatus>();
  protected readonly label = computed(() => ORDER_STATUS_LABEL[this.status()]);
  protected readonly tone = computed(() => `badge ${TONE[this.status()]}`);
}
