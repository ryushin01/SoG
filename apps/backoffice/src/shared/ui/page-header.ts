import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** 번호가 붙은 섹션 머리말. 화면마다 h1은 하나입니다. */
@Component({
  selector: 'sog-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <p class="eyebrow">
        <span>{{ index() }}</span
        ><span>{{ label() }}</span>
      </p>
      <div class="head__row">
        <div class="head__text">
          <h1 class="head__title" tabindex="-1" id="page-title">{{ heading() }}</h1>
          @if (description()) {
            <p class="head__desc">{{ description() }}</p>
          }
        </div>
        <div class="head__actions"><ng-content /></div>
      </div>
    </header>
  `,
  styles: `
    .head {
      display: grid;
      gap: 1.25rem;
      margin-block-end: 2rem;
    }
    .head__row {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      justify-content: space-between;
      gap: 1rem 2rem;
    }
    .head__text {
      display: grid;
      gap: 0.5rem;
      max-width: 48rem;
    }
    .head__title {
      font-size: clamp(1.75rem, 3.6vw, 2.75rem);
      font-weight: 500;
      letter-spacing: -0.035em;
      line-height: 1.05;
    }
    .head__title:focus {
      outline: none;
    }
    .head__desc {
      color: var(--ink-soft);
    }
    .head__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
  `,
})
export class PageHeader {
  readonly index = input.required<string>();
  readonly label = input.required<string>();
  readonly heading = input.required<string>();
  readonly description = input<string>();
}
