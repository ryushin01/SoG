import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { COUNT_STATUS_LABEL, type CountTaskStatus } from '@sog/domain';

const TONE: Record<CountTaskStatus, string> = {
  open: 'pill--stone',
  in_progress: 'pill--warn',
  submitted: 'pill--ok',
  approved: 'pill--ok',
  cancelled: 'pill--wine',
};

@Component({
  selector: 'cnt-task-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'pill ' + tone()">{{ label() }}</span>`,
})
export class TaskStatusPill {
  readonly status = input.required<CountTaskStatus>();
  protected readonly label = computed(() => COUNT_STATUS_LABEL[this.status()]);
  protected readonly tone = computed(() => TONE[this.status()]);
}
