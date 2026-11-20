import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { barRuns, ean13Modules, isGuardModule } from '@sog/domain';

/** 바코드 앞뒤의 빈칸(모듈). 스캐너가 시작과 끝을 찾을 수 있게 비워 둡니다. */
const QUIET_LEFT = 11;
const QUIET_RIGHT = 7;
const BAR_HEIGHT = 50;
const GUARD_HEIGHT = 56;

/**
 * EAN-13 바코드(SVG). 이미지 파일 없이 막대를 그리고, 숫자는 아래에 글자로 둡니다.
 * 화면 낭독기는 그림 대신 이름(바코드 숫자)을 읽습니다. 숫자가 EAN-13이 아니면 숫자만 보여 줍니다.
 */
@Component({
  selector: 'sog-sku-barcode',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (bars(); as b) {
      <svg
        class="barcode"
        [attr.viewBox]="'0 0 ' + b.width + ' ' + guard"
        preserveAspectRatio="none"
        role="img"
        [attr.aria-label]="'바코드 ' + code()"
      >
        @for (bar of b.runs; track bar.x) {
          <rect [attr.x]="bar.x" y="0" [attr.width]="bar.w" [attr.height]="bar.h" />
        }
      </svg>
    }
    <span class="digits" [attr.aria-hidden]="bars() ? 'true' : null">{{ code() }}</span>
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.125rem;
      justify-items: center;
    }
    .barcode {
      display: block;
      width: 100%;
      height: var(--barcode-height, 2.5rem);
      fill: #000;
      background: #fff;
    }
    .digits {
      font-family: var(--font-mono);
      font-size: var(--barcode-digits, 0.6875rem);
      letter-spacing: 0.12em;
      color: #000;
    }
  `,
})
export class SkuBarcode {
  /** 13자리 EAN-13 */
  readonly code = input.required<string>();

  protected readonly guard = GUARD_HEIGHT;
  protected readonly bars = computed(() => {
    const modules = ean13Modules(this.code());
    if (!modules) return null;
    return {
      width: QUIET_LEFT + modules.length + QUIET_RIGHT,
      runs: barRuns(modules).map(([start, width]) => ({
        x: QUIET_LEFT + start,
        w: width,
        h: isGuardModule(start) ? GUARD_HEIGHT : BAR_HEIGHT,
      })),
    };
  });
}
