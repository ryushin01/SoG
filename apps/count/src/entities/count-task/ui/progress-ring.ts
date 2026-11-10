import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** 진행률. 숫자를 함께 보여 줍니다. */
@Component({
  selector: 'cnt-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="progress">
      <progress [value]="done()" [max]="total() || 1" [attr.aria-label]="label()"></progress>
      <span class="mono">{{ done() }}/{{ total() }}</span>
    </div>
  `,
  styles: `
    .progress {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.8125rem;
    }
    progress {
      flex: 1;
      height: 2px;
      appearance: none;
      border: 0;
      background: var(--stone-deep);
    }
    progress::-webkit-progress-bar {
      background: var(--stone-deep);
    }
    progress::-webkit-progress-value {
      background: var(--ink);
    }
    progress::-moz-progress-bar {
      background: var(--ink);
    }
  `,
})
export class Progress {
  readonly done = input.required<number>();
  readonly total = input.required<number>();
  protected readonly label = computed(() => `${this.total()}건 중 ${this.done()}건 완료`);
}
