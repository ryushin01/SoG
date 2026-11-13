import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import type { User } from '@sog/domain';
import { AuthSession, SubmitLock, toApiError } from '@/shared/api';
import { FieldErrors } from '@/shared/ui';

/**
 * 데모 계정 로그인. 비밀번호는 공개 데모 값이라 화면에 그대로 안내합니다.
 * 붙여넣기와 비밀번호 관리자 자동 완성을 막지 않습니다(KWCAG 7.3.3 접근 가능한 인증).
 */
@Component({
  selector: 'sog-login-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldErrors],
  template: `
    <form class="stack" novalidate (submit)="onSubmit($event)">
      <fieldset class="accounts">
        <legend class="field__label">계정</legend>
        @for (user of accounts(); track user.id) {
          <label class="account" [class.account--on]="model().userId === user.id">
            <input
              type="radio"
              name="login-user"
              [value]="user.id"
              [checked]="model().userId === user.id"
              (change)="pick(user.id)"
            />
            <span class="account__name">{{ user.name }}</span>
            <span class="muted">{{ user.team }}</span>
          </label>
        } @empty {
          <p class="muted">계정 목록을 불러오는 중입니다.</p>
        }
      </fieldset>
      @if (form.userId().touched() && form.userId().invalid()) {
        <p class="field__error">계정을 골라 주세요.</p>
      }

      <div class="field">
        <label class="field__label" for="login-password">비밀번호</label>
        <input
          id="login-password"
          class="input"
          type="password"
          autocomplete="current-password"
          [formField]="form.password"
          [attr.aria-invalid]="form.password().touched() && form.password().invalid()"
          aria-describedby="login-password-hint login-password-error"
        />
        <p id="login-password-hint" class="field__hint">
          데모 계정의 비밀번호는 모두 <strong class="mono">{{ demoPassword }}</strong
          >입니다.
        </p>
        <sog-field-errors [state]="form.password()" id="login-password-error" />
      </div>

      @if (error(); as message) {
        <p class="field__error" role="alert">{{ message }}</p>
      }

      <button type="submit" class="btn btn--primary" [disabled]="lock.pending()">
        {{ lock.pending() ? '로그인 중…' : '로그인' }}
      </button>
    </form>
  `,
  styles: `
    .accounts {
      display: grid;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .accounts legend {
      margin-bottom: 0.5rem;
    }
    .account {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-height: 3rem;
      padding: 0.5rem 0.875rem;
      border: 1px solid var(--line-strong);
      cursor: pointer;
    }
    .account--on {
      border-color: var(--ink);
      background: var(--sky);
    }
    .account:has(input:focus-visible) {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }
    .account input {
      accent-color: var(--ink);
    }
    .account__name {
      font-weight: 600;
    }
  `,
})
export class LoginForm {
  /** 고를 수 있는 계정(백오피스는 관리자만) */
  readonly accounts = input.required<User[]>();
  readonly signedIn = output<User>();
  private readonly auth = inject(AuthSession);
  protected readonly lock = new SubmitLock({ keepLockedOnSuccess: true });
  protected readonly demoPassword = 'sog-demo';
  protected readonly error = signal<string | null>(null);
  protected readonly model = signal({ userId: '', password: '' });
  protected readonly form = form(this.model, (path) => {
    required(path.userId, { message: '계정을 골라 주세요.' });
    required(path.password, { message: '비밀번호를 입력해 주세요.' });
  });
  protected readonly selected = computed(() =>
    this.accounts().find((u) => u.id === this.model().userId),
  );

  protected pick(userId: string): void {
    this.model.update((value) => ({ ...value, userId }));
    this.form.userId().markAsTouched();
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.lock.run(async () => {
      let ok = false;
      await submit(this.form, async () => {
        this.error.set(null);
        try {
          const { userId, password } = this.model();
          const user = await this.auth.login(userId, password);
          ok = true;
          this.signedIn.emit(user);
        } catch (error) {
          this.error.set(toApiError(error).message);
        }
        return undefined;
      });
      if (!ok) this.lock.release();
    });
  }
}
