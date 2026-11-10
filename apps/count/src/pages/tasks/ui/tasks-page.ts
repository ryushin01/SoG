import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type CountTaskSummary, ZONE_LABEL } from '@sog/domain';
import { WmsHost } from '@/shared/api';
import { AgoPipe, DayPipe } from '@/shared/lib';
import { StateMessage } from '@/shared/ui';
import { Progress, TaskRepository, TaskStatusPill } from '@/entities/count-task';
import { OperatorSession } from '@/entities/operator';

@Component({
  selector: 'cnt-tasks-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AgoPipe, DayPipe, StateMessage, Progress, TaskStatusPill],
  templateUrl: './tasks-page.html',
  styleUrl: './tasks-page.css',
})
export class TasksPage {
  protected readonly session = inject(OperatorSession);
  private readonly repo = inject(TaskRepository);
  protected readonly zoneLabel = ZONE_LABEL;

  protected readonly tasks = resource({
    params: () => this.session.operatorId() ?? undefined,
    loader: ({ params }) => this.repo.list(params),
  });
  protected readonly active = computed(() =>
    ((this.tasks.hasValue() ? this.tasks.value() : undefined)?.data ?? []).filter(
      (task) => task.status === 'open' || task.status === 'in_progress',
    ),
  );
  protected readonly done = computed(() =>
    ((this.tasks.hasValue() ? this.tasks.value() : undefined)?.data ?? []).filter(
      (task) => task.status === 'submitted' || task.status === 'approved',
    ),
  );

  constructor() {
    inject(WmsHost).onChange(['*', 'counts'], () => this.tasks.reload());
  }

  protected overdue(task: CountTaskSummary): boolean {
    return new Date(task.dueAt).getTime() < Date.now();
  }
}
