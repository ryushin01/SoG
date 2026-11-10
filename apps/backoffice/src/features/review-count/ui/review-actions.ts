import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { CountTaskSummary } from '@sog/domain';
import { isVersionConflict, SubmitLock, toApiError } from '@/shared/api';
import { Dialog, Toaster } from '@/shared/ui';
import { CountApi } from '@/entities/count';

/**
 * 실사 승인·취소. 화면을 연 뒤 작업자가 더 세거나 다른 관리자가 먼저 처리했다면(412·409) 최신 상태를 다시 받게 합니다.
 */
@Component({
  selector: 'sog-review-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialog],
  template: `
    <div class="cluster">
      @if (task().status === 'submitted') {
        <button type="button" class="btn btn--primary" (click)="confirm.set('approve')">
          승인하고 재고 반영
        </button>
      }
      @if (cancellable()) {
        <button type="button" class="btn btn--danger" (click)="confirm.set('cancel')">
          작업 취소
        </button>
      }
    </div>

    <sog-dialog
      [open]="confirm() !== null"
      (openChange)="!$event && confirm.set(null)"
      [heading]="confirm() === 'approve' ? '실사 승인' : '실사 취소'"
    >
      <div class="stack">
        @if (confirm() === 'approve') {
          <p>
            차이가 있는 {{ task().varianceCount }}건을 재고에 반영합니다. 센 뒤에 일어난 입출고는
            그대로 더해 계산합니다.
          </p>
        } @else {
          <p>{{ task().code }} 작업을 취소합니다. 이미 센 수량은 재고에 반영하지 않습니다.</p>
        }
        @if (error(); as message) {
          <p class="field__error" role="alert">{{ message }}</p>
        }
        <div class="cluster">
          <button
            type="button"
            class="btn"
            [class.btn--primary]="confirm() === 'approve'"
            [class.btn--danger]="confirm() === 'cancel'"
            [disabled]="lock.pending()"
            (click)="run()"
          >
            {{ lock.pending() ? '처리 중…' : confirm() === 'approve' ? '승인' : '취소하기' }}
          </button>
          <button type="button" class="btn" (click)="confirm.set(null)">닫기</button>
        </div>
      </div>
    </sog-dialog>
  `,
})
export class ReviewActions {
  readonly task = input.required<CountTaskSummary>();
  readonly changed = output<void>();
  private readonly api = inject(CountApi);
  private readonly toaster = inject(Toaster);
  protected readonly lock = new SubmitLock();
  protected readonly confirm = signal<'approve' | 'cancel' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly cancellable = computed(() =>
    ['open', 'in_progress', 'submitted'].includes(this.task().status),
  );

  protected run(): void {
    const action = this.confirm();
    if (!action) return;
    void this.lock.run(async () => {
      this.error.set(null);
      const task = this.task();
      try {
        if (action === 'approve') {
          const result = await this.api.approve(task.id, task.version);
          this.toaster.show(
            `${task.code}을(를) 승인했습니다. ${result.adjusted}건을 재고에 반영했습니다.`,
            'success',
          );
        } else {
          await this.api.cancel(task.id, task.version);
          this.toaster.show(`${task.code}을(를) 취소했습니다.`, 'success');
        }
        this.confirm.set(null);
        this.changed.emit();
      } catch (error) {
        const apiError = toApiError(error);
        this.error.set(
          isVersionConflict(apiError) || apiError.code === 'INVALID_STATE'
            ? `${apiError.message} 화면의 내용을 최신으로 바꿨습니다.`
            : apiError.message,
        );
        this.changed.emit();
      }
    });
  }
}
