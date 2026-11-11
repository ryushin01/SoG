import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { type CountLineView, skuArtUrl, ZONE_LABEL } from '@sog/domain';
import { NetworkState, Presence, SubmitLock, toApiError, WmsHost } from '@/shared/api';
import { AgoPipe, DayPipe } from '@/shared/lib';
import { StateMessage } from '@/shared/ui';
import {
  LINE_STATE_LABEL,
  LINE_STATE_TONE,
  lineState,
  Progress,
  TaskRepository,
  TaskStatusPill,
} from '@/entities/count-task';
import { ScanField } from '@/features/scan-barcode';
import { PeerNotice } from '@/features/show-presence';
import { Outbox } from '@/entities/outbox';

@Component({
  selector: 'cnt-task-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AgoPipe,
    DayPipe,
    StateMessage,
    Progress,
    TaskStatusPill,
    ScanField,
    PeerNotice,
  ],
  templateUrl: './task-page.html',
  styleUrl: './task-page.css',
})
export class TaskPage {
  readonly taskId = input.required<string>();
  private readonly repo = inject(TaskRepository);
  private readonly router = inject(Router);
  protected readonly outbox = inject(Outbox);
  protected readonly network = inject(NetworkState);
  protected readonly zoneLabel = ZONE_LABEL;
  protected readonly stateLabel = LINE_STATE_LABEL;
  protected readonly stateTone = LINE_STATE_TONE;
  protected readonly lock = new SubmitLock({ keepLockedOnSuccess: true });
  protected readonly submitError = signal<string | null>(null);

  protected readonly detail = resource({
    params: () => this.taskId(),
    loader: ({ params }) => this.repo.detail(params),
  });

  protected readonly rows = computed(() =>
    ((this.detail.hasValue() ? this.detail.value() : undefined)?.data.lines ?? []).map((line) => ({
      line,
      state: lineState(line, this.outbox.forLine(line.id)),
      art: skuArtUrl(line.sku),
    })),
  );
  /** 로케이션 순서대로 묶어 동선을 따라 셀 수 있게 합니다. */
  protected readonly groups = computed(() => {
    const groups = new Map<string, { code: string; rows: ReturnType<TaskPage['rows']> }>();
    for (const row of this.rows()) {
      const key = row.line.location.code;
      if (!groups.has(key)) groups.set(key, { code: key, rows: [] });
      groups.get(key)!.rows.push(row);
    }
    return [...groups.values()];
  });
  protected readonly doneCount = computed(
    () => this.rows().filter((r) => r.state === 'counted' || r.state === 'queued').length,
  );
  protected readonly blockers = computed(() => {
    const rows = this.rows();
    const notes: string[] = [];
    const left = rows.filter((r) => r.state === 'pending' || r.state === 'recount').length;
    const queued = rows.filter((r) => r.state === 'queued').length;
    const conflicts = rows.filter((r) => r.state === 'conflict').length;
    if (left) notes.push(`세지 않은 품목 ${left}건`);
    if (conflicts) notes.push(`확인이 필요한 품목 ${conflicts}건`);
    if (queued) notes.push(`아직 보내지 않은 기록 ${queued}건`);
    if (!this.network.online()) notes.push('오프라인');
    return notes;
  });
  protected readonly editable = computed(() => {
    const status = (this.detail.hasValue() ? this.detail.value() : undefined)?.data.task.status;
    return status === 'open' || status === 'in_progress';
  });

  constructor() {
    inject(Presence).track(() => `counts/${this.taskId()}`);
    inject(WmsHost).onChange(['*', 'counts'], (event) => {
      if (event.topics.includes('*') || event.topics.includes(`counts/${this.taskId()}`))
        this.detail.reload();
    });
  }

  protected open(line: CountLineView): void {
    void this.router.navigate(['/tasks', line.taskId, 'lines', line.id]);
  }

  protected submit(): void {
    const task = (this.detail.hasValue() ? this.detail.value() : undefined)?.data.task;
    if (!task) return;
    void this.lock.run(async () => {
      this.submitError.set(null);
      try {
        await this.repo.submit(task.id, task.version);
        await this.router.navigateByUrl('/');
      } catch (error) {
        this.submitError.set(toApiError(error).message);
        this.lock.release();
        this.detail.reload();
      }
    });
  }
}
