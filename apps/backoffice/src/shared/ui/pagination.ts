import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'sog-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pages() > 1) {
      <nav class="pager" [attr.aria-label]="label()">
        <button
          type="button"
          class="btn btn--small"
          [disabled]="page() <= 1"
          aria-label="이전 페이지"
          (click)="pageChange.emit(page() - 1)"
        >
          이전
        </button>
        <ol class="pager__list">
          @for (n of numbers(); track n) {
            <li>
              <button
                type="button"
                class="btn btn--small"
                [class.btn--primary]="n === page()"
                [attr.aria-current]="n === page() ? 'page' : null"
                [attr.aria-label]="'페이지 ' + n"
                (click)="pageChange.emit(n)"
              >
                {{ n }}
              </button>
            </li>
          }
        </ol>
        <button
          type="button"
          class="btn btn--small"
          [disabled]="page() >= pages()"
          aria-label="다음 페이지"
          (click)="pageChange.emit(page() + 1)"
        >
          다음
        </button>
      </nav>
    }
  `,
  styles: `
    .pager {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      margin-block-start: 1rem;
    }
    .pager__list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
  `,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly total = input.required<number>();
  readonly size = input.required<number>();
  readonly label = input('페이지 이동');
  readonly pageChange = output<number>();
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.size())));
  protected readonly numbers = computed(() =>
    Array.from({ length: this.pages() }, (_, i) => i + 1),
  );
}
