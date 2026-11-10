import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type DashboardKpis, ZONE_LABEL } from '@sog/domain';
import { NumPipe, WonPipe } from '@/shared/lib';

/** 구역별 재고 금액. 한 계열이라 범례 없이 막대 끝에 값을 적습니다. */
@Component({
  selector: 'sog-zone-stock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NumPipe, WonPipe],
  template: `
    <ul class="zones">
      @for (zone of rows(); track zone.zone) {
        <li class="zone">
          <span class="zone__name">{{ zone.label }}</span>
          <span class="zone__track" aria-hidden="true">
            <span class="zone__bar" [style.width.%]="zone.ratio"></span>
          </span>
          <span class="zone__value"
            >{{ zone.value | won }}<span class="muted"> · {{ zone.units | num }}개</span></span
          >
        </li>
      }
    </ul>
  `,
  styles: `
    .zones {
      display: grid;
      gap: 0.875rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .zone {
      display: grid;
      grid-template-columns: 7.5rem minmax(0, 1fr);
      grid-template-areas: 'name value' 'track track';
      gap: 0.375rem 1rem;
      font-size: 0.875rem;
    }
    .zone__name {
      grid-area: name;
      font-weight: 600;
    }
    .zone__value {
      grid-area: value;
      justify-self: end;
      font-variant-numeric: tabular-nums;
    }
    .zone__track {
      grid-area: track;
      height: 0.625rem;
      background: var(--mist);
    }
    .zone__bar {
      display: block;
      height: 100%;
      min-width: 2px;
      border-radius: 0 4px 4px 0;
      background: var(--series-receipt);
    }
  `,
})
export class ZoneStock {
  readonly zones = input.required<DashboardKpis['zoneValue']>();
  protected readonly rows = computed(() => {
    const max = Math.max(1, ...this.zones().map((z) => z.value));
    return this.zones().map((z) => ({
      ...z,
      label: ZONE_LABEL[z.zone],
      ratio: (z.value / max) * 100,
    }));
  });
}
