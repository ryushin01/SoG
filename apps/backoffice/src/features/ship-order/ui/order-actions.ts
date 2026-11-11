import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { OrderSummary } from '@sog/domain';
import { isVersionConflict, SubmitLock, toApiError } from '@/shared/api';
import { Dialog, Toaster } from '@/shared/ui';
import { OrderApi } from '@/entities/order';

/**
 * 출고 확정과 취소. 화면을 연 뒤 작업자가 더 집었거나 다른 관리자가 먼저 처리했으면(412·409) 최신 상태를 다시 받습니다.
 */
@Component({
  selector: 'sog-order-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialog],
  template: `
    <div class="cluster">
      @if (order().status === 'picked') {
        <button type="button" class="btn btn--primary" (click)="confirm.set('ship')">
          출고 확정
        </button>
      }
      @if (cancellable()) {
        <button type="button" class="btn btn--danger" (click)="confirm.set('cancel')">
          출고 지시 취소
        </button>
      }
    </div>

    <sog-dialog
      [open]="confirm() !== null"
      (openChange)="!$event && confirm.set(null)"
      [heading]="confirm() === 'ship' ? '출고 확정' : '출고 지시 취소'"
    >
      <div class="stack">
        @if (confirm() === 'ship') {
          <p>
            집은 {{ order().pickedUnits }}개를 재고에서 빼고 출고 기록을 남깁니다.
            @if (short() > 0) {
              덜 집은 {{ short() }}개는 예약을 풉니다.
            }
          </p>
        } @else {
          <p>
            {{ order().code }}의 예약 {{ order().units }}개를 모두 풉니다. 재고는 줄지 않습니다.
          </p>
        }
        @if (error(); as message) {
          <p class="field__error" role="alert">{{ message }}</p>
        }
        <div class="cluster">
          <button
            type="button"
            class="btn"
            [class.btn--primary]="confirm() === 'ship'"
            [class.btn--danger]="confirm() === 'cancel'"
            [disabled]="lock.pending()"
            (click)="run()"
          >
            {{ lock.pending() ? '처리 중…' : confirm() === 'ship' ? '출고' : '취소하기' }}
          </button>
          <button type="button" class="btn" (click)="confirm.set(null)">닫기</button>
        </div>
      </div>
    </sog-dialog>
  `,
})
export class OrderActions {
  readonly order = input.required<OrderSummary>();
  readonly changed = output<void>();
  private readonly api = inject(OrderApi);
  private readonly toaster = inject(Toaster);
  protected readonly lock = new SubmitLock();
  protected readonly confirm = signal<'ship' | 'cancel' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly cancellable = computed(() =>
    ['reserved', 'picking', 'picked'].includes(this.order().status),
  );
  protected readonly short = computed(() => this.order().units - this.order().pickedUnits);

  protected run(): void {
    const action = this.confirm();
    if (!action) return;
    void this.lock.run(async () => {
      this.error.set(null);
      const order = this.order();
      try {
        if (action === 'ship') {
          await this.api.ship(order.id, order.version);
          this.toaster.show(`${order.code}을(를) 출고했습니다.`, 'success');
        } else {
          await this.api.cancel(order.id, order.version);
          this.toaster.show(`${order.code}을(를) 취소하고 예약을 풀었습니다.`, 'success');
        }
        this.confirm.set(null);
      } catch (error) {
        const apiError = toApiError(error);
        this.error.set(
          isVersionConflict(apiError) || apiError.code === 'INVALID_STATE'
            ? `${apiError.message} 화면을 최신으로 바꿨습니다.`
            : apiError.message,
        );
      }
      this.changed.emit();
    });
  }
}
