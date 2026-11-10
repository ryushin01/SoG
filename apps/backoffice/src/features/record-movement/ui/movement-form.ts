import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { form, FormField, max, maxLength, min, required, submit } from '@angular/forms/signals';
import {
  available,
  MOVEMENT_LABEL,
  type Movement,
  type MovementRequest,
  type Page,
  type SkuDetail,
  type SkuSummary,
} from '@sog/domain';
import { idempotencyKey, SubmitLock, toApiError } from '@/shared/api';
import { FieldErrors, Toaster } from '@/shared/ui';
import { LocationDirectory } from '@/entities/location';
import { MovementApi } from '@/entities/movement';

type MovementKind = 'receipt' | 'shipment' | 'transfer';

interface MovementModel {
  skuId: string;
  type: MovementKind;
  from: string;
  to: string;
  qty: number;
  reason: string;
  ref: string;
}

const DEFAULT_REASON: Record<MovementKind, string> = {
  receipt: '정기 입고',
  shipment: '고객사 출고',
  transfer: '로케이션 재배치',
};

/**
 * 입고·출고·이동 등록.
 * 폼을 열 때 만든 멱등 키를 저장 요청에 붙여, 응답을 못 받고 다시 눌러도 재고는 한 번만 바뀝니다.
 * 가용 재고는 화면에서 먼저 막고, 그사이 다른 사람이 출고해 부족해지면 서버가 409로 거절합니다.
 */
@Component({
  selector: 'sog-movement-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldErrors],
  templateUrl: './movement-form.html',
  styleUrl: './movement-form.css',
})
export class MovementForm {
  /** 품목 상세에서 열면 품목을 고정합니다. */
  readonly skuId = input<string>();
  readonly done = output<Movement>();

  private readonly api = inject(MovementApi);
  private readonly toaster = inject(Toaster);
  protected readonly directory = inject(LocationDirectory);
  protected readonly lock = new SubmitLock({ keepLockedOnSuccess: true });
  /** 이 폼에서 보내는 요청의 멱등 키. 성공하기 전까지 다시 보내도 같은 키를 씁니다. */
  private readonly key = idempotencyKey();
  protected readonly labels = MOVEMENT_LABEL;
  protected readonly kinds: MovementKind[] = ['receipt', 'shipment', 'transfer'];

  protected readonly model = signal<MovementModel>({
    skuId: '',
    type: 'receipt',
    from: '',
    to: '',
    qty: 1,
    reason: DEFAULT_REASON.receipt,
    ref: '',
  });
  protected readonly selectedSku = computed(() => this.skuId() ?? this.model().skuId);

  protected readonly skus = httpResource<Page<SkuSummary>>(() =>
    this.skuId() ? undefined : { url: '/api/skus', params: { size: 100, sort: 'name' } },
  );
  protected readonly detail = httpResource<SkuDetail>(() =>
    this.selectedSku() ? `/api/skus/${this.selectedSku()}` : undefined,
  );

  protected readonly sources = computed(() =>
    ((this.detail.hasValue() ? this.detail.value() : undefined)?.stocks ?? []).map((stock) => ({
      id: stock.locationId,
      code: stock.location.code,
      free: available(stock.onHand, stock.reserved),
    })),
  );
  protected readonly maxQty = computed(() => {
    const { type, from } = this.model();
    if (type === 'receipt') return 100_000;
    return this.sources().find((source) => source.id === from)?.free ?? 0;
  });

  protected readonly form = form(this.model, (path) => {
    required(path.skuId, { message: '품목을 선택해 주세요.', when: () => !this.skuId() });
    required(path.from, {
      message: '출발 로케이션을 선택해 주세요.',
      when: ({ valueOf }) => valueOf(path.type) !== 'receipt',
    });
    required(path.to, {
      message: '도착 로케이션을 선택해 주세요.',
      when: ({ valueOf }) => valueOf(path.type) !== 'shipment',
    });
    min(path.qty, 1, { message: '수량은 1 이상이어야 합니다.' });
    max(path.qty, () => this.maxQty(), { message: '가용 재고보다 많이 보낼 수 없습니다.' });
    required(path.reason, { message: '사유를 입력해 주세요.' });
    maxLength(path.reason, 100, { message: '사유는 100자 이내로 입력해 주세요.' });
    maxLength(path.ref, 40, { message: '참조 번호는 40자 이내로 입력해 주세요.' });
  });

  protected readonly serverError = signal<string | null>(null);

  protected id(name: string): string {
    return `movement-${name}`;
  }

  protected setType(type: MovementKind): void {
    this.model.update((value) => ({
      ...value,
      type,
      reason: Object.values(DEFAULT_REASON).includes(value.reason)
        ? DEFAULT_REASON[type]
        : value.reason,
    }));
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.lock.run(async () => {
      let ok = false;
      await submit(this.form, async () => {
        const value = this.model();
        const skuId = this.selectedSku();
        const request: MovementRequest =
          value.type === 'receipt'
            ? {
                type: 'receipt',
                skuId,
                toLocationId: value.to,
                qty: value.qty,
                reason: value.reason,
                ref: value.ref || undefined,
              }
            : value.type === 'shipment'
              ? {
                  type: 'shipment',
                  skuId,
                  fromLocationId: value.from,
                  qty: value.qty,
                  reason: value.reason,
                  ref: value.ref || undefined,
                }
              : {
                  type: 'transfer',
                  skuId,
                  fromLocationId: value.from,
                  toLocationId: value.to,
                  qty: value.qty,
                  reason: value.reason,
                };
        this.serverError.set(null);
        try {
          const movement = await this.api.create(request, this.key);
          ok = true;
          this.toaster.show(
            `${MOVEMENT_LABEL[movement.type]} ${movement.qty}개를 등록했습니다.`,
            'success',
          );
          this.done.emit(movement);
        } catch (error) {
          const apiError = toApiError(error);
          this.serverError.set(apiError.message);
          // 재고가 바뀌었을 수 있으니 가용 수량을 새로 받습니다.
          if (apiError.code === 'INSUFFICIENT_STOCK') this.detail.reload();
        }
        return undefined;
      });
      // 실패하면 잠금을 풀어 다시 보낼 수 있게 합니다. 성공하면 화면이 닫힐 때까지 잠가 둡니다.
      if (!ok) this.lock.release();
    });
  }
}
