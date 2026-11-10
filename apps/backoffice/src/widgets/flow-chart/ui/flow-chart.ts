import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { DashboardKpis } from '@sog/domain';
import { NumPipe } from '@/shared/lib';

const W = 720;
const H = 240;
const PAD = { top: 16, right: 8, bottom: 28, left: 40 };

/**
 * 최근 14일 입고·출고 수량. 같은 단위라 축은 하나입니다.
 * 막대에 포인터를 올리거나 차트에 초점을 두고 좌우 화살표를 누르면 그날의 두 값을 함께 보여 줍니다.
 */
@Component({
  selector: 'sog-flow-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NumPipe],
  templateUrl: './flow-chart.html',
  styleUrl: './flow-chart.css',
})
export class FlowChart {
  readonly flow = input.required<DashboardKpis['flow']>();
  protected readonly active = signal<number | null>(null);
  protected readonly W = W;
  protected readonly H = H;
  protected readonly PAD = PAD;

  private readonly max = computed(() => {
    const top = Math.max(1, ...this.flow().flatMap((d) => [d.receipt, d.shipment]));
    const step = top > 100 ? 50 : top > 40 ? 20 : 10;
    return Math.ceil(top / step) * step;
  });

  protected readonly ticks = computed(() => [0, 0.5, 1].map((t) => Math.round(this.max() * t)));

  protected readonly bars = computed(() => {
    const days = this.flow();
    const band = (W - PAD.left - PAD.right) / days.length;
    const barW = Math.max(4, Math.min(14, (band - 10) / 2));
    return days.map((day, i) => {
      const x0 = PAD.left + i * band + band / 2;
      return {
        ...day,
        label: this.dayLabel(day.date),
        band: { x: PAD.left + i * band, w: band },
        rBar: { x: x0 - barW - 1, w: barW, h: this.h(day.receipt) },
        sBar: { x: x0 + 1, w: barW, h: this.h(day.shipment) },
        cx: x0,
      };
    });
  });

  protected readonly totals = computed(() => ({
    receipt: this.flow().reduce((s, d) => s + d.receipt, 0),
    shipment: this.flow().reduce((s, d) => s + d.shipment, 0),
  }));

  protected readonly summary = computed(
    () =>
      `최근 ${this.flow().length}일 입고 ${this.totals().receipt.toLocaleString('ko-KR')}개, 출고 ${this.totals().shipment.toLocaleString('ko-KR')}개`,
  );

  protected readonly current = computed(() => {
    const i = this.active();
    return i === null ? null : (this.bars()[i] ?? null);
  });

  protected y(value: number): number {
    return H - PAD.bottom - this.h(value);
  }

  protected h(value: number): number {
    return ((H - PAD.top - PAD.bottom) * value) / this.max();
  }

  /** 위쪽만 4px 둥근 막대(바닥선에 붙음) */
  protected barPath(x: number, w: number, h: number): string {
    const base = H - PAD.bottom;
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    return `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + w - r} Q${x + w},${base - h} ${x + w},${base - h + r} V${base} Z`;
  }

  protected dayLabel(date: string): string {
    const [, m, d] = date.split('-');
    return `${Number(m)}/${Number(d)}`;
  }

  protected onKey(event: KeyboardEvent): void {
    const last = this.flow().length - 1;
    const now = this.active();
    if (event.key === 'ArrowRight') this.active.set(now === null ? 0 : Math.min(last, now + 1));
    else if (event.key === 'ArrowLeft') this.active.set(now === null ? last : Math.max(0, now - 1));
    else if (event.key === 'Home') this.active.set(0);
    else if (event.key === 'End') this.active.set(last);
    else if (event.key === 'Escape') this.active.set(null);
    else return;
    event.preventDefault();
  }
}
