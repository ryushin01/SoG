import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeader } from '@/shared/ui';

@Component({
  selector: 'sog-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeader],
  template: `
    <sog-page-header
      index="404"
      label="Not found"
      heading="페이지를 찾을 수 없습니다"
      description="주소가 바뀌었거나 없는 화면입니다."
    />
    <a class="btn btn--primary" routerLink="/">운영 현황으로 가기</a>
  `,
})
export class NotFoundPage {}
