import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { form, FormField, maxLength, min, required, submit } from '@angular/forms/signals';
import {
  formatDelta,
  type Sku,
  type SkuDetail,
  type StockLevel,
  type StockWithLocation,
} from '@sog/domain';
import { isVersionConflict, SubmitLock, toApiError } from '@/shared/api';
import { FieldErrors, Toaster } from '@/shared/ui';
import { SkuApi } from '@/entities/sku';
import { Session } from '@/entities/user';

/**
 * 재고 조정(실물 확인 후 수량 고치기).
 * 연 뒤에 누가 이 재고를 움직였다면 서버가 412로 거절하고, 최신 수량을 보여 준 뒤 다시 확인을 받습니다.
 */
@Component({
  selector: 'sog-adjust-stock-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldErrors],
  template: `
    <form class="stack" novalidate (submit)="onSubmit($event)">
      <dl class="facts">
        <div>
          <dt>품목</dt>
          <dd>{{ sku().name }}</dd>
        </div>
        <div>
          <dt>로케이션</dt>
          <dd class="mono">{{ stock().location.code }}</dd>
        </div>
        <div>
          <dt>장부 수량</dt>
          <dd>
            {{ base().onHand }}{{ sku().unit }}
            <span class="muted mono">v{{ base().version }}</span>
          </dd>
        </div>
        <div>
          <dt>출고 지시</dt>
          <dd>{{ base().reserved }}{{ sku().unit }}</dd>
        </div>
      </dl>

      @if (conflictBy(); as by) {
        <div class="conflict" role="alert">
          <p>
            <strong>{{ by }}</strong
            >님이 그사이 이 재고를 바꿔 장부 수량이
            <strong>{{ base().onHand }}{{ sku().unit }}</strong
            >이 되었습니다. 입력한 수량이 맞는지 확인한 뒤 다시 저장해 주세요.
          </p>
        </div>
      }

      <div class="field">
        <label class="field__label" for="adjust-qty">실물 수량</label>
        <input
          id="adjust-qty"
          class="input"
          type="number"
          inputmode="numeric"
          [formField]="form.onHand"
          [attr.aria-invalid]="form.onHand().touched() && form.onHand().invalid()"
          aria-describedby="adjust-qty-hint adjust-qty-error"
        />
        <p id="adjust-qty-hint" class="field__hint">조정 폭: {{ delta() }}{{ sku().unit }}</p>
        <sog-field-errors [state]="form.onHand()" id="adjust-qty-error" />
      </div>

      <div class="field">
        <label class="field__label" for="adjust-reason">사유</label>
        <input
          id="adjust-reason"
          class="input"
          [formField]="form.reason"
          autocomplete="off"
          [attr.aria-invalid]="form.reason().touched() && form.reason().invalid()"
          aria-describedby="adjust-reason-error"
        />
        <sog-field-errors [state]="form.reason()" id="adjust-reason-error" />
      </div>

      @if (serverError(); as message) {
        <p class="field__error" role="alert">{{ message }}</p>
      }

      <button type="submit" class="btn btn--primary" [disabled]="lock.pending()">
        {{ lock.pending() ? '저장 중…' : conflictBy() ? '확인하고 다시 저장' : '조정 저장' }}
      </button>
    </form>
  `,
  styles: `
    .facts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
      margin: 0;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--line);
    }
    .facts dt {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--ink-soft);
    }
    .facts dd {
      margin: 0;
      font-weight: 600;
    }
    .conflict {
      padding: 0.875rem 1rem;
      border-inline-start: 4px solid var(--accent);
      background: var(--accent-soft);
    }
  `,
})
export class AdjustStockForm implements OnInit {
  readonly stock = input.required<StockWithLocation>();
  readonly sku = input.required<Sku>();
  readonly done = output<StockLevel>();

  private readonly api = inject(SkuApi);
  private readonly toaster = inject(Toaster);
  private readonly session = inject(Session);
  protected readonly lock = new SubmitLock({ keepLockedOnSuccess: true });

  /** 기준 재고. 충돌이 나면 서버의 최신 값으로 바꿉니다. */
  private readonly latest = signal<StockLevel | null>(null);
  protected readonly base = computed(() => this.latest() ?? this.stock());
  protected readonly conflictBy = signal<string | null>(null);
  protected readonly serverError = signal<string | null>(null);

  protected readonly model = signal({ onHand: 0, reason: '실물 확인' });
  protected readonly form = form(this.model, (path) => {
    min(path.onHand, 0, { message: '수량은 0 이상이어야 합니다.' });
    required(path.reason, { message: '사유를 입력해 주세요.' });
    maxLength(path.reason, 100, { message: '사유는 100자 이내로 입력해 주세요.' });
  });
  protected readonly delta = computed(() => formatDelta(this.model().onHand - this.base().onHand));

  ngOnInit(): void {
    this.model.update((value) => ({ ...value, onHand: this.stock().onHand }));
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.lock.run(async () => {
      let ok = false;
      await submit(this.form, async () => {
        this.serverError.set(null);
        try {
          const saved = await this.api.adjust(this.base().id, this.base().version, this.model());
          ok = true;
          this.toaster.show(
            `${this.stock().location.code} 재고를 ${saved.onHand}${this.sku().unit}로 조정했습니다.`,
            'success',
          );
          this.done.emit(saved);
        } catch (error) {
          const apiError = toApiError(error);
          if (isVersionConflict(apiError)) {
            const current =
              (apiError.current as SkuDetail).stocks.find((s) => s.id === this.base().id) ?? null;
            this.latest.set(current);
            this.conflictBy.set(this.session.nameOf(current?.updatedBy));
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
