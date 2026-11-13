import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { AuthSession } from '@/shared/api';
import { Session } from '@/entities/user';
import { LoginForm } from '@/features/auth';

@Component({
  selector: 'sog-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoginForm],
  template: `
    <div class="login">
      <p class="eyebrow"><span>SoG</span><span>Sign in</span></p>
      <h1 id="page-title" tabindex="-1" class="title">백오피스 로그인</h1>
      <p class="muted">
        관리자 계정으로 들어갑니다. 동시 수정을 시연하려면 새 탭을 열어 다른 관리자로 로그인해
        보세요.
      </p>
      @if (auth.notice(); as notice) {
        <p class="notice" role="status">{{ notice }}</p>
      }
      <sog-login-form [accounts]="session.managers()" (signedIn)="done()" />
      <p class="muted field-app">
        현장 작업자는 <a href="/count/">현장 실사 앱</a>에서 로그인합니다.
      </p>
    </div>
  `,
  styles: `
    .login {
      display: grid;
      gap: 1.25rem;
      width: min(100%, 28rem);
      margin: 2rem auto;
    }
    .title {
      font-size: 2rem;
      font-weight: 500;
      letter-spacing: -0.035em;
    }
    .title:focus {
      outline: none;
    }
    .notice {
      padding: 0.75rem 1rem;
      border-inline-start: 4px solid var(--accent);
      background: var(--accent-soft);
    }
  `,
})
export class LoginPage {
  /** 로그인 뒤 돌아갈 주소(?returnUrl=) */
  readonly returnUrl = input<string>('');
  protected readonly auth = inject(AuthSession);
  protected readonly session = inject(Session);
  private readonly router = inject(Router);

  protected done(): void {
    const target = this.returnUrl();
    // 사이트 안 경로만 따라갑니다(열린 리디렉션 방지).
    void this.router.navigateByUrl(
      target && target.startsWith('/') && !target.startsWith('//') ? target : '/',
    );
  }
}
