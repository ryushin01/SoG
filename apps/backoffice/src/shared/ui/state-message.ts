import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** 불러오는 중·빈 목록·오류 안내. 오류일 때는 다시 시도 버튼을 둡니다. */
@Component({
  selector: 'sog-state-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="state"
      [class.state--error]="kind() === 'error'"
      [attr.role]="kind() === 'error' ? 'alert' : null"
    >
      @if (kind() === 'loading') {
        <span class="state__bar" aria-hidden="true"></span>
      }
      <p>{{ message() }}</p>
      @if (kind() === 'error') {
        <button type="button" class="btn btn--small" (click)="retry.emit()">다시 시도</button>
      }
    </div>
  `,
  styles: `
    .state {
      display: grid;
      justify-items: start;
      gap: 0.75rem;
      padding: 2rem 0;
      color: var(--ink-soft);
    }
    .state--error {
      color: var(--accent);
    }
    .state__bar {
      width: 8rem;
      height: 2px;
      background: linear-gradient(90deg, var(--ink) 0 30%, var(--mist) 30%);
      background-size: 200% 100%;
      animation: slide 1.1s linear infinite;
    }
    @keyframes slide {
      from {
        background-position: 100% 0;
      }
      to {
        background-position: -100% 0;
      }
    }
  `,
})
export class StateMessage {
  readonly kind = input<'loading' | 'empty' | 'error'>('loading');
  readonly message = input.required<string>();
  readonly retry = output<void>();
}
