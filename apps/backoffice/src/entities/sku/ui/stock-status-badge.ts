import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { STOCK_STATUS_LABEL, type StockStatus } from '@sog/domain';

const TONE: Record<StockStatus, string> = {
  ok: 'badge--ok',
  low: 'badge--warn',
  out: 'badge--danger',
};

/** 재고 상태. 색과 글자를 함께 보여 줍니다. */
@Component({
  selector: 'sog-stock-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="tone()">{{ label() }}</span>`,
})
export class StockStatusBadge {
  readonly status = input.required<StockStatus>();
  protected readonly label = computed(() => STOCK_STATUS_LABEL[this.status()]);
  protected readonly tone = computed(() => `badge ${TONE[this.status()]}`);
}
