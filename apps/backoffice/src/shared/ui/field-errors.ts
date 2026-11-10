import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { FieldState } from '@angular/forms/signals';

/** 필드 오류 문구. 입력란의 aria-describedby가 이 id를 가리킵니다. */
@Component({
  selector: 'sog-field-errors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [id]="id()">
      @if (visible()) {
        @for (error of state().errors(); track error.kind) {
          <p class="field__error">{{ error.message ?? '입력값을 확인해 주세요.' }}</p>
        }
      }
    </div>
  `,
})
export class FieldErrors {
  readonly state = input.required<FieldState<unknown>>();
  readonly id = input.required<string>();
  protected readonly visible = computed(() => this.state().touched() && this.state().invalid());
}
