import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '@/shared/ui';
import { ActivityFeed } from '@/widgets/activity-feed';

@Component({
  selector: 'sog-activity-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, ActivityFeed],
  template: `
    <sog-page-header
      index="05"
      label="Activity"
      heading="활동 기록"
      description="입출고, 실사, 정보 수정, 막아 낸 동시 수정 충돌까지 모든 변경을 시간순으로 남깁니다."
    />
    <sog-activity-feed [limit]="100" />
  `,
})
export class ActivityPage {}
