import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { COUNT_STATUS_LABEL, type CountTaskStatus } from '@sog/domain';

const TONE: Record<CountTaskStatus, string> = {
  open: 'badge--neutral',
  in_progress: 'badge--info',
  submitted: 'badge--warn',
  approved: 'badge--ok',
  cancelled: 'badge--neutral',
};

@Component({
  selector: 'sog-count-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="tone()">{{ label() }}</span>`,
})
export class CountStatusBadge {
  readonly status = input.required<CountTaskStatus>();
  protected readonly label = computed(() => COUNT_STATUS_LABEL[this.status()]);
  protected readonly tone = computed(() => `badge ${TONE[this.status()]}`);
}
