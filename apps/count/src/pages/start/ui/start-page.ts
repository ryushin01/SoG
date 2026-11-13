import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthSession, NetworkState, SubmitLock, toApiError } from '@/shared/api';
import { OperatorSession } from '@/entities/operator';

/**
 * 작업자 로그인. 이름을 고르고 공개 데모 비밀번호를 넣습니다.
 * 붙여넣기와 자동 완성을 막지 않고(KWCAG 7.3.3), 이름을 고르면 비밀번호 칸으로 초점을 옮깁니다.
 */
@Component({
  selector: 'cnt-start-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page start">
      <p class="caption">System of Goods · 평택 1센터</p>
      <h1 id="page-title" tabindex="-1" class="title">누가 실사하나요?</h1>
      <p class="muted">
        이름을 고르고 비밀번호를 넣으면 배정된 작업이 열립니다. 이 기기에 로그인을 남겨 둡니다.
      </p>
      @if (auth.notice(); as notice) {
        <p class="notice" role="status">{{ notice }}</p>
      }
      @if (!network.online()) {
        <p class="notice" role="status">처음 로그인할 때는 연결이 필요합니다.</p>
      }

      <ul class="people" aria-label="작업자">
        @for (user of session.operators(); track user.id) {
          <li>
            <button
              type="button"
              class="person"
              [class.person--on]="selected() === user.id"
              [attr.aria-pressed]="selected() === user.id"
              (click)="choose(user.id)"
            >
              <span class="person__name">{{ user.name }}</span>
              <span class="caption">{{ user.team }}</span>
              <span class="person__arrow" aria-hidden="true">{{
                selected() === user.id ? '✓' : '→'
              }}</span>
            </button>
          </li>
        } @empty {
          <li class="muted">작업자 목록을 불러오는 중입니다. 처음 한 번은 연결이 필요합니다.</li>
        }
      </ul>

      <form class="password" [hidden]="!selected()" novalidate (submit)="login($event)">
        <label class="label" for="start-password">비밀번호</label>
        <input
          #password
          id="start-password"
          class="input"
          type="password"
          autocomplete="current-password"
          aria-describedby="start-password-hint start-password-error"
          [value]="value()"
          (input)="value.set($any($event.target).value)"
        />
        <p id="start-password-hint" class="hint">
          데모 계정의 비밀번호는 모두 <strong class="mono">sog-demo</strong>입니다.
        </p>
        <p id="start-password-error" class="error" aria-live="polite">{{ error() }}</p>
        <button
          type="submit"
          class="btn btn--solid btn--block"
          [disabled]="lock.pending() || !network.online()"
        >
          {{ lock.pending() ? '로그인 중…' : '로그인' }}
        </button>
      </form>
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
    .notice {
      padding: 0.75rem 1rem;
      background: var(--warn-soft);
      color: var(--warn);
      font-size: 0.875rem;
    }
    .people {
      margin: 1rem 0 0;
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
      padding: 0.75rem 0.5rem;
      border: 0;
      border-bottom: 1px solid var(--line);
      background: none;
      text-align: start;
      cursor: pointer;
    }
    .person:hover,
    .person--on {
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
    .password {
      display: grid;
      gap: 0.5rem;
    }
    .error:empty {
      display: none;
    }
  `,
})
export class StartPage {
  protected readonly session = inject(OperatorSession);
  protected readonly auth = inject(AuthSession);
  protected readonly network = inject(NetworkState);
  private readonly router = inject(Router);
  protected readonly lock = new SubmitLock({ keepLockedOnSuccess: true });
  protected readonly selected = signal<string | null>(null);
  protected readonly value = signal('');
  protected readonly error = signal('');
  private readonly password = viewChild.required<ElementRef<HTMLInputElement>>('password');

  protected choose(id: string): void {
    this.selected.set(id);
    this.error.set('');
    // 다음 렌더 뒤(칸이 보인 뒤) 초점을 옮깁니다.
    setTimeout(() => this.password().nativeElement.focus());
  }

  protected login(event: Event): void {
    event.preventDefault();
    const userId = this.selected();
    if (!userId) return;
    if (!this.value()) {
      this.error.set('비밀번호를 입력해 주세요.');
      return;
    }
    void this.lock.run(async () => {
      try {
        await this.auth.login(userId, this.value());
        await this.router.navigateByUrl('/');
      } catch (error) {
        this.error.set(toApiError(error).message);
        this.lock.release();
      }
    });
  }
}
