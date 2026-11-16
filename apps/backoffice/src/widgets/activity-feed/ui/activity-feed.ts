import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, linkedSignal } from '@angular/core';
import type { ActivityPage } from '@sog/domain';
import { WmsHost } from '@/shared/api';
import { StateMessage } from '@/shared/ui';
import { ActivityList } from '@/entities/activity';

/** 최근 활동. 어느 탭에서든 변경이 일어나면 다시 불러옵니다. */
@Component({
  selector: 'sog-activity-feed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActivityList, StateMessage],
  template: `
    @if (items(); as list) {
      <sog-activity-list
        [items]="list"
        [class.stale]="resource.isLoading()"
        [attr.aria-busy]="resource.isLoading()"
      />
    } @else if (resource.error()) {
      <sog-state-message
        kind="error"
        message="활동 기록을 불러오지 못했습니다."
        (retry)="resource.reload()"
      />
    } @else {
      <sog-state-message message="활동 기록을 불러오는 중입니다." />
    }
  `,
  // 새로 고치는 중에는 글자를 흐리게 하지 않고(명도 대비) 품목 상세 표처럼 위쪽 강조 선으로 알립니다.
  styles: `
    sog-activity-list {
      display: block;
    }
    .stale {
      box-shadow: inset 0 3px 0 var(--accent);
      cursor: progress;
    }
  `,
})
export class ActivityFeed {
  readonly limit = input(12);
  protected readonly resource = httpResource<ActivityPage>(() => ({
    url: '/api/activity',
    params: { limit: this.limit() },
  }));
  /** 다시 불러오는 동안 이전 목록을 그대로 둡니다. */
  protected readonly items = linkedSignal<
    ActivityPage | undefined,
    ActivityPage['items'] | undefined
  >({
    source: () => (this.resource.hasValue() ? this.resource.value() : undefined),
    computation: (page, previous) => page?.items ?? previous?.value,
  });

  constructor() {
    inject(WmsHost).onChange(['*', 'skus', 'counts', 'dashboard'], () => this.resource.reload());
  }
}
