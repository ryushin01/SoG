import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CountTaskSummary, DashboardKpis } from '@sog/domain';
import { WmsHost } from '@/shared/api';
import { NumPipe, WonPipe } from '@/shared/lib';
import { PageHeader, StateMessage } from '@/shared/ui';
import { CountProgress, CountStatusBadge } from '@/entities/count';
import { ActivityFeed } from '@/widgets/activity-feed';
import { FlowChart } from '@/widgets/flow-chart';
import { ZoneStock } from '@/widgets/zone-stock';

@Component({
  selector: 'sog-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NumPipe,
    WonPipe,
    PageHeader,
    StateMessage,
    CountProgress,
    CountStatusBadge,
    ActivityFeed,
    FlowChart,
    ZoneStock,
  ],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.css',
})
export class DashboardPage {
  protected readonly kpis = httpResource<DashboardKpis>(() => '/api/dashboard');
  protected readonly review = httpResource<{ items: CountTaskSummary[] }>(() => ({
    url: '/api/counts',
    params: { status: 'submitted,in_progress' },
  }));
  /** 다시 불러오는 동안에도 이전 숫자를 그대로 보여 줍니다. */
  protected readonly data = linkedSignal<DashboardKpis | undefined, DashboardKpis | undefined>({
    source: () => (this.kpis.hasValue() ? this.kpis.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });
  protected readonly tasks = computed(
    () => (this.review.hasValue() ? this.review.value() : undefined)?.items ?? [],
  );

  constructor() {
    inject(WmsHost).onChange(['*', 'dashboard', 'counts', 'skus'], () => {
      this.kpis.reload();
      this.review.reload();
    });
  }
}
