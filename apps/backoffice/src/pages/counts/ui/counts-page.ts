import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  COUNT_STATUS_LABEL,
  type CountTask,
  type CountTaskStatus,
  type CountTaskSummary,
  ZONE_LABEL,
} from '@sog/domain';
import { WmsHost } from '@/shared/api';
import { DatePipe } from '@/shared/lib';
import { Dialog, PageHeader, StateMessage } from '@/shared/ui';
import { CountProgress, CountStatusBadge } from '@/entities/count';
import { CreateCountForm } from '@/features/create-count';

type Filter = CountTaskStatus | 'all';

@Component({
  selector: 'sog-counts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    Dialog,
    PageHeader,
    StateMessage,
    CountProgress,
    CountStatusBadge,
    CreateCountForm,
  ],
  templateUrl: './counts-page.html',
  styleUrl: './counts-page.css',
})
export class CountsPage {
  private readonly router = inject(Router);
  protected readonly filters: { value: Filter; label: string }[] = [
    { value: 'all', label: '전체' },
    ...(Object.entries(COUNT_STATUS_LABEL) as [CountTaskStatus, string][]).map(
      ([value, label]) => ({ value, label }),
    ),
  ];
  protected readonly filter = signal<Filter>('all');
  protected readonly createOpen = signal(false);
  protected readonly zoneLabel = ZONE_LABEL;

  protected readonly list = httpResource<{ items: CountTaskSummary[] }>(() => ({
    url: '/api/counts',
    params: { status: this.filter() === 'all' ? '' : this.filter() },
  }));
  protected readonly items = linkedSignal<
    { items: CountTaskSummary[] } | undefined,
    CountTaskSummary[] | undefined
  >({
    source: () => (this.list.hasValue() ? this.list.value() : undefined),
    computation: (value, previous) => value?.items ?? previous?.value,
  });

  constructor() {
    inject(WmsHost).onChange(['*', 'counts'], () => this.list.reload());
  }

  protected created(task: CountTask): void {
    this.createOpen.set(false);
    void this.router.navigate(['/counts', task.id]);
  }

  protected overdue(task: CountTaskSummary): boolean {
    return (
      ['open', 'in_progress'].includes(task.status) && new Date(task.dueAt).getTime() < Date.now()
    );
  }
}
