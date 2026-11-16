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
import { Router } from '@angular/router';
import type { ActivityGroup, ActivityPage as ActivityPageData } from '@sog/domain';
import { WmsHost } from '@/shared/api';
import { PageHeader, StateMessage } from '@/shared/ui';
import { ActivityList } from '@/entities/activity';
import { Session } from '@/entities/user';

/** 한 번에 더 받는 건수 */
const STEP = 50;
/** 서버가 한 번에 돌려주는 최대 건수 */
const MAX = 200;

const GROUPS: { value: ActivityGroup; label: string }[] = [
  { value: 'movement', label: '입출고' },
  { value: 'count', label: '재고 실사' },
  { value: 'order', label: '출고 지시' },
  { value: 'sku', label: '정보 수정' },
  { value: 'conflict', label: '막아 낸 충돌' },
];

/** 활동 기록: 종류·사람으로 거르고, 더 오래된 기록까지 이어 봅니다(감사용). 조건은 주소에 남습니다. */
@Component({
  selector: 'sog-activity-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, StateMessage, ActivityList],
  templateUrl: './activity-page.html',
  styleUrl: './activity-page.css',
})
export class ActivityPage {
  /** 쿼리 문자열(?kind=&by=)과 연결된 입력 */
  readonly kind = input<string>('');
  readonly by = input<string>('');

  private readonly router = inject(Router);
  protected readonly session = inject(Session);
  protected readonly groups = GROUPS;
  protected readonly kindFilter = linkedSignal(() => this.kind() ?? '');
  protected readonly byFilter = linkedSignal(() => this.by() ?? '');
  /** 받은 묶음 수. 더 보기를 누를 때마다 50건씩 늘립니다(최대 200건). */
  protected readonly pages = signal(1);
  protected readonly limit = computed(() => Math.min(MAX, STEP * this.pages()));

  protected readonly list = httpResource<ActivityPageData>(() => ({
    url: '/api/activity',
    params: { limit: this.limit(), kind: this.kindFilter(), by: this.byFilter() },
  }));
  /** 다시 불러오는 동안 이전 목록을 그대로 둡니다. */
  protected readonly rows = linkedSignal<
    ActivityPageData | undefined,
    ActivityPageData | undefined
  >({
    source: () => (this.list.hasValue() ? this.list.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });
  protected readonly total = computed(() => this.rows()?.total ?? this.rows()?.items.length ?? 0);
  protected readonly more = computed(() => {
    const shown = this.rows()?.items.length ?? 0;
    return shown < this.total() && this.limit() < MAX;
  });
  protected readonly capped = computed(() => this.limit() >= MAX && this.total() > MAX);
  protected readonly filtered = computed(() => !!(this.kindFilter() || this.byFilter()));

  constructor() {
    inject(WmsHost).onChange(['*', 'skus', 'counts', 'orders', 'dashboard'], () =>
      this.list.reload(),
    );
    // 조건을 바꾸면 처음 50건부터 보고, 주소에도 남겨 새로 고침·공유해도 유지합니다.
    effect(() => {
      const queryParams = { kind: this.kindFilter() || null, by: this.byFilter() || null };
      this.pages.set(1);
      void this.router.navigate([], { queryParams, replaceUrl: true });
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected reset(): void {
    this.kindFilter.set('');
    this.byFilter.set('');
  }
}
