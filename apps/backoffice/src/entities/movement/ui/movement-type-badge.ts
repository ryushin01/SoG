import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MOVEMENT_LABEL, type MovementType } from '@sog/domain';

const TONE: Record<MovementType, string> = {
  receipt: 'badge--ok',
  shipment: 'badge--neutral',
  transfer: 'badge--info',
  adjustment: 'badge--warn',
  count: 'badge--danger',
};

@Component({
  selector: 'sog-movement-type-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="tone()">{{ label() }}</span>`,
})
export class MovementTypeBadge {
  readonly type = input.required<MovementType>();
  protected readonly label = computed(() => MOVEMENT_LABEL[this.type()]);
  protected readonly tone = computed(() => `badge ${TONE[this.type()]}`);
}
