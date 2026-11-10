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
import {
  type CountLineView,
  type CountTaskDetail,
  settledOnHand,
  variance,
  ZONE_LABEL,
} from '@sog/domain';
import { WmsHost } from '@/shared/api';
import { AgoPipe, DatePipe, DeltaPipe, NumPipe, WonPipe } from '@/shared/lib';
import { PageHeader, StateMessage } from '@/shared/ui';
import { CountProgress, CountStatusBadge } from '@/entities/count';
import { UserNamePipe } from '@/entities/user';
import { RecountButton, ReviewActions } from '@/features/review-count';

type LineFilter = 'all' | 'variance' | 'pending' | 'moved';

@Component({
  selector: 'sog-count-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AgoPipe,
    DatePipe,
    DeltaPipe,
    NumPipe,
    WonPipe,
    PageHeader,
    StateMessage,
    CountProgress,
    CountStatusBadge,
    UserNamePipe,
    RecountButton,
    ReviewActions,
  ],
  templateUrl: './count-detail-page.html',
  styleUrl: './count-detail-page.css',
})
export class CountDetailPage {
  readonly taskId = input.required<string>();
  private readonly host = inject(WmsHost);
  protected readonly zoneLabel = ZONE_LABEL;

  protected readonly detail = httpResource<CountTaskDetail>(() => `/api/counts/${this.taskId()}`);
  protected readonly data = linkedSignal<CountTaskDetail | undefined, CountTaskDetail | undefined>({
    source: () => (this.detail.hasValue() ? this.detail.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });
  protected readonly filter = signal<LineFilter>('all');
  /** 다른 탭에서 방금 바뀐 줄. 잠깐 강조합니다. */
  protected readonly fresh = signal<Set<string>>(new Set());
  private lastVersions = new Map<string, number>();

  protected readonly filters: { value: LineFilter; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'variance', label: '차이 있음' },
    { value: 'pending', label: '미실사·재실사' },
    { value: 'moved', label: '실사 중 이동' },
  ];

  protected readonly lines = computed(() => {
    const lines = this.data()?.lines ?? [];
    switch (this.filter()) {
      case 'variance':
        return lines.filter((line) => (variance(line) ?? 0) !== 0);
      case 'pending':
        return lines.filter((line) => line.status !== 'counted');
      case 'moved':
        return lines.filter((line) => line.movedSinceSnapshot !== 0);
      default:
        return lines;
    }
  });

  protected readonly summary = computed(() => {
    const lines = this.data()?.lines ?? [];
    const counted = lines.filter((line) => line.countedQty !== null);
    const varianceValue = counted.reduce(
      (sum, line) => sum + (variance(line) ?? 0) * line.sku.unitCost,
      0,
    );
    return {
      shortage: counted.filter((line) => (variance(line) ?? 0) < 0).length,
      overage: counted.filter((line) => (variance(line) ?? 0) > 0).length,
      varianceValue,
      moved: lines.filter((line) => line.movedSinceSnapshot !== 0).length,
    };
  });

  protected readonly reviewable = computed(() => {
    const status = this.data()?.task.status;
    return status === 'in_progress' || status === 'submitted';
  });

  constructor() {
    const title = inject(Title);
    effect(() => {
      const task = this.data()?.task;
      if (task) title.setTitle(`${task.code} ${task.title} · 재고 실사 · SoG 백오피스`);
    });
    // 이전 응답과 버전을 비교해 바뀐 줄을 찾습니다.
    effect(() => {
      const lines = (this.detail.hasValue() ? this.detail.value() : undefined)?.lines;
      if (!lines) return;
      const changed = new Set<string>();
      for (const line of lines) {
        const before = this.lastVersions.get(line.id);
        if (before !== undefined && before !== line.version) changed.add(line.id);
      }
      this.lastVersions = new Map(lines.map((line) => [line.id, line.version]));
      if (changed.size > 0) {
        this.fresh.set(changed);
        setTimeout(() => this.fresh.set(new Set()), 2400);
      }
    });
    this.host.onChange(['*', 'counts', 'skus'], (event) => {
      if (
        event.topics.includes('*') ||
        event.topics.includes(`counts/${this.taskId()}`) ||
        event.topics.includes('skus')
      ) {
        this.detail.reload();
      }
    });
  }

  protected variance(line: CountLineView): number | null {
    return variance(line);
  }

  protected settled(line: CountLineView): number | null {
    return line.countedQty === null ? null : settledOnHand(line.countedQty, line.movedSinceCount);
  }
}
