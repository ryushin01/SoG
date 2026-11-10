import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'cnt-state-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="state" [attr.role]="kind() === 'error' ? 'alert' : null">
      <p [class.error]="kind() === 'error'">{{ message() }}</p>
      @if (kind() === 'error') {
        <button type="button" class="btn" (click)="retry.emit()">다시 시도</button>
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
  `,
})
export class StateMessage {
  readonly kind = input<'loading' | 'empty' | 'error'>('loading');
  readonly message = input.required<string>();
  readonly retry = output<void>();
}
