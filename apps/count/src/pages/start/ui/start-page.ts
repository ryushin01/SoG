import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { OperatorSession } from '@/entities/operator';

@Component({
  selector: 'cnt-start-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page start">
      <p class="caption">System of Goods · 평택 1센터</p>
      <h1 id="page-title" tabindex="-1" class="title">누가 실사하나요?</h1>
      <p class="muted">이름을 고르면 배정된 실사 작업이 열립니다. 이 기기에 기억해 둡니다.</p>
      <ul class="people">
        @for (user of session.operators(); track user.id) {
          <li>
            <button type="button" class="person" (click)="choose(user.id)">
              <span class="person__name">{{ user.name }}</span>
              <span class="caption">{{ user.team }}</span>
              <span class="person__arrow" aria-hidden="true">→</span>
            </button>
          </li>
        } @empty {
          <li class="muted">작업자 목록을 불러오는 중입니다. 처음 한 번은 연결이 필요합니다.</li>
        }
      </ul>
    </div>
  `,
  styles: `
    .start {
      display: grid;
      gap: 1rem;
      padding-top: 3rem;
    }
    .title {
      font-size: clamp(2.25rem, 9vw, 3.5rem);
    }
    .title:focus {
      outline: none;
    }
    .people {
      margin: 1.5rem 0 0;
      padding: 0;
      list-style: none;
      border-top: 1px solid var(--ink);
    }
    .person {
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-areas: 'name arrow' 'team arrow';
      align-items: center;
      width: 100%;
      min-height: 4.5rem;
      padding: 0.75rem 0.25rem;
      border: 0;
      border-bottom: 1px solid var(--line);
      background: none;
      text-align: start;
      cursor: pointer;
    }
    .person:hover {
      background: var(--sky);
    }
    .person__name {
      grid-area: name;
      font-size: 1.375rem;
      font-weight: 500;
    }
    .person .caption {
      grid-area: team;
    }
    .person__arrow {
      grid-area: arrow;
      font-size: 1.5rem;
    }
  `,
})
export class StartPage {
  protected readonly session = inject(OperatorSession);
  private readonly router = inject(Router);

  protected choose(id: string): void {
    this.session.operatorId.set(id);
    void this.router.navigateByUrl('/');
  }
}
