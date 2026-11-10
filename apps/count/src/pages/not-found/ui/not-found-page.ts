import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'cnt-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="page">
      <p class="caption">404</p>
      <h1 id="page-title" tabindex="-1">페이지를 찾을 수 없습니다</h1>
      <p><a class="btn" routerLink="/">내 실사 작업으로</a></p>
    </div>
  `,
  styles: `
    h1 {
      margin: 0.5rem 0 1.5rem;
      font-size: 2rem;
    }
  `,
})
export class NotFoundPage {}
