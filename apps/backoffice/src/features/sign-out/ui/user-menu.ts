import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthSession, Presence } from '@/shared/api';

/** 로그인한 사용자와 로그아웃. 다른 관리자로 시연하려면 새 탭을 열어 다른 계정으로 로그인합니다. */
@Component({
  selector: 'sog-user-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.user(); as user) {
      <div class="menu">
        <span class="menu__label">로그인</span>
        <span class="menu__name"
          >{{ user.name }} <span class="muted">· {{ user.team }}</span></span
        >
        <button type="button" class="btn btn--small" (click)="logout()">로그아웃</button>
      </div>
    }
  `,
  styles: `
    .menu {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }
    .menu__label {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ink-soft);
    }
    .menu__name {
      font-weight: 600;
    }
  `,
})
export class UserMenu {
  protected readonly auth = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly presence = inject(Presence);

  protected logout(): void {
    this.presence.leave();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
