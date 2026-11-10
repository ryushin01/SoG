import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import type { CountLineView } from '@sog/domain';

/**
 * 바코드 입력. 현장 스캐너는 키보드처럼 숫자를 치고 Enter를 보내므로 일반 입력란으로 받습니다.
 * 같은 품목이 여러 로케이션에 있으면 아직 세지 않은 줄을 먼저 고릅니다.
 */
@Component({
  selector: 'cnt-scan-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="scan" (submit)="find($event)" role="search" aria-label="바코드로 품목 찾기">
      <label class="label" for="scan-input">바코드 스캔</label>
      <div class="scan__row">
        <input
          id="scan-input"
          class="input"
          inputmode="numeric"
          autocomplete="off"
          enterkeyhint="search"
          placeholder="바코드 또는 품목 코드"
          aria-describedby="scan-hint scan-message"
          [value]="value()"
          (input)="value.set($any($event.target).value)"
        />
        <button type="submit" class="btn">찾기</button>
      </div>
      <p id="scan-hint" class="hint">스캐너로 찍거나 숫자를 입력한 뒤 찾기를 누릅니다.</p>
      <p id="scan-message" class="error" aria-live="polite">{{ message() }}</p>
    </form>
  `,
  styles: `
    .scan__row {
      display: flex;
      gap: 0.5rem;
    }
    .scan__row .btn {
      flex: none;
    }
    .scan .hint {
      margin-top: 0.375rem;
    }
    .error:empty {
      display: none;
    }
  `,
})
export class ScanField {
  readonly lines = input.required<CountLineView[]>();
  readonly found = output<CountLineView>();
  protected readonly value = signal('');
  protected readonly message = signal('');

  protected find(event: Event): void {
    event.preventDefault();
    const code = this.value().trim().toUpperCase();
    if (!code) {
      this.message.set('바코드를 입력해 주세요.');
      return;
    }
    const matches = this.lines().filter(
      (line) => line.sku.barcode === code || line.sku.code.toUpperCase() === code,
    );
    const target = matches.find((line) => line.status !== 'counted') ?? matches[0];
    if (!target) {
      this.message.set(`이 작업에 없는 바코드입니다: ${code}`);
      return;
    }
    this.message.set('');
    this.value.set('');
    this.found.emit(target);
  }
}
