import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import {
  applyEach,
  form,
  FormField,
  maxLength,
  min,
  required,
  submit,
} from '@angular/forms/signals';
import type { Page, ShipmentOrder, SkuSummary } from '@sog/domain';
import { idempotencyKey, SubmitLock, toApiError } from '@/shared/api';
import { FieldErrors, Toaster } from '@/shared/ui';
import { OrderApi } from '@/entities/order';
import { Session } from '@/entities/user';

interface OrderModel {
  customer: string;
  assigneeId: string;
  dueAt: string;
  lines: { skuId: string; qty: number }[];
}

function tomorrow(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

/**
 * 출고 지시 만들기. 저장하면 서버가 쓰기 잠금 안에서 가용 재고를 다시 계산해 로케이션별로 예약합니다.
 * 그사이 다른 관리자가 같은 재고를 잡았다면 409로 거절되고, 모자란 품목과 지금 가용 수량을 알려 줍니다.
 */
@Component({
  selector: 'sog-create-order-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldErrors],
  templateUrl: './create-order-form.html',
  styleUrl: './create-order-form.css',
})
export class CreateOrderForm {
  readonly created = output<ShipmentOrder>();
  private readonly api = inject(OrderApi);
  private readonly toaster = inject(Toaster);
  protected readonly session = inject(Session);
  protected readonly lock = new SubmitLock({ keepLockedOnSuccess: true });
  private readonly key = idempotencyKey();
  protected readonly serverError = signal<string | null>(null);

  protected readonly skus = httpResource<Page<SkuSummary>>(() => ({
    url: '/api/skus',
    params: { size: 100, sort: 'name' },
  }));
  protected readonly skuList = computed(() =>
    this.skus.hasValue() ? this.skus.value().items : [],
  );

  protected readonly model = signal<OrderModel>({
    customer: '',
    assigneeId: '',
    dueAt: tomorrow(),
    lines: [{ skuId: '', qty: 1 }],
  });
  protected readonly form = form(this.model, (path) => {
    required(path.customer, { message: '고객사를 입력해 주세요.' });
    maxLength(path.customer, 40, { message: '고객사는 40자 이내로 입력해 주세요.' });
    required(path.assigneeId, { message: '피킹 작업자를 선택해 주세요.' });
    required(path.dueAt, { message: '출고 마감을 입력해 주세요.' });
    applyEach(path.lines, (line) => {
      required(line.skuId, { message: '품목을 선택해 주세요.' });
      min(line.qty, 1, { message: '수량은 1 이상이어야 합니다.' });
    });
  });

  protected availableOf(skuId: string): SkuSummary | undefined {
    return this.skuList().find((sku) => sku.id === skuId);
  }

  protected taken(skuId: string, index: number): boolean {
    return this.model().lines.some((line, i) => i !== index && line.skuId === skuId);
  }

  protected addLine(): void {
    this.model.update((value) => ({ ...value, lines: [...value.lines, { skuId: '', qty: 1 }] }));
  }

  protected removeLine(index: number): void {
    this.model.update((value) => ({ ...value, lines: value.lines.filter((_, i) => i !== index) }));
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.lock.run(async () => {
      let ok = false;
      await submit(this.form, async () => {
        this.serverError.set(null);
        try {
          const value = this.model();
          const order = await this.api.create(
            {
              ...value,
              dueAt: `${value.dueAt}T18:00:00+09:00`,
              lines: value.lines.map((line) => ({ skuId: line.skuId, qty: Number(line.qty) })),
            },
            this.key,
          );
          ok = true;
          this.toaster.show(`${order.code}을(를) 만들고 재고를 예약했습니다.`, 'success');
          this.created.emit(order);
        } catch (error) {
          this.serverError.set(toApiError(error).message);
          // 가용 수량이 바뀌었을 수 있으니 새로 받습니다.
          this.skus.reload();
        }
        return undefined;
      });
      if (!ok) this.lock.release();
    });
  }
}
