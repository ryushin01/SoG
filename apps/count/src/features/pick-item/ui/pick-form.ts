import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { form, FormField, max, maxLength, min, required, submit } from '@angular/forms/signals';
import type { OrderDetail } from '@sog/domain';
import {
  idempotencyKey,
  isVersionConflict,
  NetworkState,
  SubmitLock,
  toApiError,
} from '@/shared/api';
import { PickApi } from '@/entities/pick-order';

type RouteItem = OrderDetail['route'][number];

/**
 * 한 로케이션에서 집은 수량 확인. 기본값은 예약 수량이고, 덜 집으면 사유를 받습니다.
 * 다른 기기에서 먼저 바뀌었으면(412) 최신 내용을 다시 받게 알립니다.
 */
@Component({
  selector: 'cnt-pick-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField],
  template: `
    <form class="pick" novalidate (submit)="onSubmit($event)">
      <div class="stepper">
        <button
          type="button"
          class="btn stepper__btn"
          [disabled]="model().qty <= 0"
          (click)="step(-1)"
        >
          <span aria-hidden="true">−</span><span class="visually-hidden">1 빼기</span>
        </button>
        <input
          class="stepper__input"
          type="number"
          inputmode="numeric"
          [id]="'pick-qty-' + item().id"
          [formField]="form.qty"
          [attr.aria-label]="'집은 수량, 예약 ' + item().qty + item().sku.unit"
          [attr.aria-invalid]="form.qty().touched() && form.qty().invalid()"
          [attr.aria-describedby]="'pick-error-' + item().id"
        />
        <button
          type="button"
          class="btn stepper__btn"
          [disabled]="model().qty >= item().qty"
          (click)="step(1)"
        >
          <span aria-hidden="true">+</span><span class="visually-hidden">1 더하기</span>
        </button>
      </div>
      @if (model().qty < item().qty) {
        <div>
          <label class="label" [for]="'pick-note-' + item().id">덜 집은 사유</label>
          <input
            class="input"
            autocomplete="off"
            placeholder="파손, 위치에 없음 등"
            [id]="'pick-note-' + item().id"
            [formField]="form.note"
            [attr.aria-invalid]="form.note().touched() && form.note().invalid()"
            [attr.aria-describedby]="'pick-error-' + item().id"
          />
        </div>
      }
      <div [id]="'pick-error-' + item().id">
        @for (state of [form.qty(), form.note()]; track $index) {
          @if (state.touched() && state.invalid()) {
            <p class="error">{{ state.errors()[0]?.message }}</p>
          }
        }
        @if (serverError(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      </div>
      <button
        type="submit"
        class="btn btn--solid btn--block"
        [disabled]="lock.pending() || !network.online()"
      >
        {{
          lock.pending()
            ? '저장 중…'
            : network.online()
              ? '집음 확인'
              : '연결되면 저장할 수 있습니다'
        }}
      </button>
    </form>
  `,
  styles: `
    .pick {
      display: grid;
      gap: 0.75rem;
    }
    .stepper {
      display: grid;
      grid-template-columns: 3.5rem 1fr 3.5rem;
      border: 1px solid var(--ink);
      border-radius: var(--radius);
    }
    .stepper__btn {
      min-height: 3.5rem;
      border: 0;
      border-radius: 0;
      font-size: 1.5rem;
      font-family: var(--font-sans);
    }
    .stepper__input {
      min-width: 0;
      border: 0;
      border-inline: 1px solid var(--line);
      background: #fff;
      font-size: 1.75rem;
      text-align: center;
      -moz-appearance: textfield;
    }
    .stepper__input::-webkit-inner-spin-button,
    .stepper__input::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
  `,
})
export class PickForm implements OnInit {
  readonly orderId = input.required<string>();
  readonly version = input.required<number>();
  readonly item = input.required<RouteItem>();
  readonly done = output<void>();
  /** 다른 기기에서 먼저 바뀌어 다시 받아야 할 때. 화면이 새로 그려지므로 안내는 부모가 보여 줍니다. */
  readonly stale = output<string>();
  private readonly api = inject(PickApi);
  protected readonly network = inject(NetworkState);
  protected readonly lock = new SubmitLock({ keepLockedOnSuccess: true });
  private readonly key = idempotencyKey();
  protected readonly serverError = signal<string | null>(null);

  protected readonly model = signal({ qty: 0, note: '' });
  protected readonly form = form(this.model, (path) => {
    min(path.qty, 0, { message: '0 이상으로 입력해 주세요.' });
    max(path.qty, () => this.item().qty, { message: '예약보다 많이 집을 수 없습니다.' });
    required(path.note, {
      message: '덜 집었으면 사유를 적어 주세요.',
      when: ({ valueOf }) => Number(valueOf(path.qty)) < this.item().qty,
    });
    maxLength(path.note, 100, { message: '사유는 100자 이내로 적어 주세요.' });
  });

  ngOnInit(): void {
    const item = this.item();
    this.model.set({ qty: item.pickedQty ?? item.qty, note: item.note });
  }

  protected step(delta: number): void {
    this.model.update((value) => ({
      ...value,
      qty: Math.min(this.item().qty, Math.max(0, (Number(value.qty) || 0) + delta)),
    }));
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.lock.run(async () => {
      let ok = false;
      await submit(this.form, async () => {
        this.serverError.set(null);
        const { qty, note } = this.model();
        try {
          await this.api.pick(
            this.orderId(),
            this.item().id,
            this.version(),
            { pickedQty: Number(qty), note: Number(qty) < this.item().qty ? note.trim() : '' },
            this.key,
          );
          ok = true;
          navigator.vibrate?.(40);
          this.done.emit();
        } catch (error) {
          const apiError = toApiError(error);
          if (isVersionConflict(apiError)) {
            this.stale.emit(
              '그사이 출고 지시가 바뀌어 최신 내용으로 다시 열었습니다. 확인하고 다시 저장해 주세요.',
            );
          } else if (apiError.code === 'INVALID_STATE') {
            this.stale.emit(apiError.message);
          } else {
            this.serverError.set(apiError.message);
          }
        }
        return undefined;
      });
      if (!ok) this.lock.release();
    });
  }
}
