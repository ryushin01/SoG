import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  input,
  model,
  viewChild,
} from '@angular/core';

let nextId = 0;

/**
 * 모달 대화상자. 네이티브 dialog의 showModal을 써서 초점 가두기, Esc 닫기, 배경 비활성화를 브라우저에 맡깁니다.
 * 닫히면 브라우저가 열기 전 초점 위치로 되돌립니다.
 */
@Component({
  selector: 'sog-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="dialog" [attr.aria-labelledby]="titleId" (close)="open.set(false)">
      <div class="dialog__head">
        <h2 class="dialog__title" [id]="titleId">{{ heading() }}</h2>
        <button type="button" class="btn btn--quiet btn--small" (click)="open.set(false)">
          닫기
        </button>
      </div>
      <div class="dialog__body">
        <ng-content />
      </div>
    </dialog>
  `,
  styles: `
    .dialog {
      width: min(36rem, calc(100vw - 2rem));
      max-height: calc(100dvh - 2rem);
      padding: 0;
      border: 1px solid var(--ink);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--ink);
    }
    .dialog::backdrop {
      background: rgb(38 41 51 / 0.45);
    }
    .dialog__head {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--line);
      background: var(--surface);
    }
    .dialog__title {
      font-size: 1.125rem;
    }
    .dialog__body {
      padding: 1.25rem;
    }
  `,
})
export class Dialog {
  readonly open = model(false);
  readonly heading = input.required<string>();
  protected readonly titleId = `sog-dialog-${nextId++}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.open() && !element.open) element.showModal();
      if (!this.open() && element.open) element.close();
    });
  }
}
