import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Session } from '@/entities/user';

/** 이 탭의 관리자를 바꿉니다. 탭마다 따로 저장되어 두 탭을 서로 다른 사용자로 쓸 수 있습니다. */
@Component({
  selector: 'sog-user-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="switcher">
      <span class="switcher__label">사용자</span>
      <select class="select switcher__select" [value]="session.userId()" (change)="change($event)">
        @for (user of session.managers(); track user.id) {
          <option [value]="user.id" [selected]="user.id === session.userId()">
            {{ user.name }} · {{ user.team }}
          </option>
        }
      </select>
    </label>
  `,
  styles: `
    .switcher {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .switcher__label {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ink-soft);
    }
    .switcher__select {
      width: auto;
      min-height: 2.25rem;
      padding-block: 0.25rem;
      background: transparent;
    }
  `,
})
export class UserSwitcher {
  protected readonly session = inject(Session);

  protected change(event: Event): void {
    this.session.userId.set((event.target as HTMLSelectElement).value);
  }
}
