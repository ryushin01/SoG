import { HttpClient, httpResource } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
  COUNT_STATUS_LABEL,
  type CountLineView,
  type CountTaskDetail,
  type Reference,
  settledOnHand,
  variance,
  ZONE_LABEL,
} from '@sog/domain';
import { Presence, WmsHost } from '@/shared/api';
import { AgoPipe, DatePipe, DeltaPipe, downloadCsv, NumPipe, WonPipe } from '@/shared/lib';
import { PageHeader, StateMessage } from '@/shared/ui';
import { CountProgress, CountStatusBadge } from '@/entities/count';
import { Session, UserNamePipe } from '@/entities/user';
import { RecountButton, ReviewActions } from '@/features/review-count';
import { PresenceNotice } from '@/features/show-presence';

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
    PresenceNotice,
  ],
  templateUrl: './count-detail-page.html',
  styleUrl: './count-detail-page.css',
})
export class CountDetailPage {
  readonly taskId = input.required<string>();
  private readonly host = inject(WmsHost);
  private readonly session = inject(Session);
  private readonly http = inject(HttpClient);
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
    inject(Presence).track(() => `counts/${this.taskId()}`);
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

  /** 실사 차이 보고서: 장부·실사·차이·차이 금액·승인 시 재고를 항목마다 */
  protected async exportCsv(): Promise<void> {
    const data = this.data();
    if (!data) return;
    // 사용자 목록을 아직 못 받았으면 먼저 받아, 센 사람 칸에 ID 대신 이름이 들어가게 합니다.
    const users = this.session.users().length
      ? this.session.users()
      : (await firstValueFrom(this.http.get<Reference>('/api/reference'))).users;
    const nameOf = (id: string | null) => users.find((user) => user.id === id)?.name ?? id ?? '';
    const { task, lines } = data;
    const state = { pending: '미실사', counted: '완료', recount: '재실사 요청' } as const;
    downloadCsv(
      `sog-실사-${task.code}.csv`,
      [
        '작업',
        '상태',
        '로케이션',
        '품목 코드',
        '품목명',
        '단위',
        '장부',
        '실사',
        '차이',
        '차이 금액',
        '실사 중 이동',
        '승인 시 재고',
        '항목 상태',
        '센 사람',
        '센 시각',
        '메모',
      ],
      lines.map((line) => {
        const v = variance(line);
        return [
          task.code,
          COUNT_STATUS_LABEL[task.status],
          line.location.code,
          line.sku.code,
          line.sku.name,
          line.sku.unit,
          line.expectedQty,
          line.countedQty,
          v,
          v === null ? null : v * line.sku.unitCost,
          line.movedSinceSnapshot,
          this.settled(line),
          state[line.status],
          nameOf(line.countedBy),
          line.countedAt,
          line.note,
        ];
      }),
    );
  }
}
