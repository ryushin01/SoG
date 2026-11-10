import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { CountLineView } from '@sog/domain';
import { SubmitLock, toApiError } from '@/shared/api';
import { Toaster } from '@/shared/ui';
import { CountApi } from '@/entities/count';

/** 한 줄을 다시 세도록 작업자에게 돌려보냅니다. 작업자 앱은 다음 저장에서 버전 충돌로 이 요청을 알게 됩니다. */
@Component({
  selector: 'sog-recount-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="btn btn--small"
      [attr.aria-label]="'재실사 요청: ' + line().sku.name + ' ' + line().location.code"
      [disabled]="lock.pending()"
      (click)="request()"
    >
      재실사
    </button>
  `,
})
export class RecountButton {
  readonly taskId = input.required<string>();
  readonly line = input.required<CountLineView>();
  readonly changed = output<void>();
  private readonly api = inject(CountApi);
  private readonly toaster = inject(Toaster);
  protected readonly lock = new SubmitLock();

  protected request(): void {
    void this.lock.run(async () => {
      const line = this.line();
      try {
        await this.api.recount(this.taskId(), line.id, line.version);
        this.toaster.show(
          `${line.sku.name}(${line.location.code})을(를) 다시 세도록 요청했습니다.`,
          'success',
        );
      } catch (error) {
        this.toaster.show(toApiError(error).message, 'error');
      }
      this.changed.emit();
    });
  }
}
