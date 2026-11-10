import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** 실사 진행률. 숫자를 함께 적어 막대 길이만으로 판단하지 않게 합니다. */
@Component({
  selector: 'sog-count-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="progress">
      <progress [value]="counted()" [max]="total() || 1" [attr.aria-label]="label()"></progress>
      <span class="progress__text">{{ counted() }}/{{ total() }}</span>
    </div>
  `,
  styles: `
    .progress {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 8rem;
    }
    progress {
      flex: 1;
      height: 0.375rem;
      appearance: none;
      border: 0;
      background: var(--mist);
    }
    progress::-webkit-progress-bar {
      background: var(--mist);
    }
    progress::-webkit-progress-value {
      background: var(--ink);
    }
    progress::-moz-progress-bar {
      background: var(--ink);
    }
    .progress__text {
      font-family: var(--font-mono);
      font-size: 0.75rem;
    }
  `,
})
export class CountProgress {
  readonly counted = input.required<number>();
  readonly total = input.required<number>();
  readonly name = input('실사 진행률');
  protected readonly label = computed(
    () => `${this.name()} ${this.total()}건 중 ${this.counted()}건`,
  );
}
