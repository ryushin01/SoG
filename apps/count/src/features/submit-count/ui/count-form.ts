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
import { form, FormField, max, maxLength, min, required, submit } from '@angular/forms/signals';
import type { CountLineView } from '@sog/domain';
import { NetworkState, SubmitLock } from '@/shared/api';
import { Outbox } from '@/entities/outbox';

/**
 * 수량 입력. 큰 −/+ 버튼과 숫자 입력란을 함께 둡니다.
 * 저장하면 먼저 보낼함에 넣으므로 오프라인에서도 바로 다음 품목으로 넘어갈 수 있습니다.
 */
@Component({
  selector: 'cnt-count-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField],
  templateUrl: './count-form.html',
  styleUrl: './count-form.css',
})
export class CountForm implements OnInit {
  readonly line = input.required<CountLineView>();
  /** 블라인드 실사면 장부 수량을 숨깁니다. */
  readonly blind = input(false);
  /** 수량을 미리 채울 값(보낼함에 있는 값 등) */
  readonly initial = input<number | null>(null);
  readonly saved = output<number>();

  private readonly outbox = inject(Outbox);
  protected readonly network = inject(NetworkState);
  /** 저장하면 다음 품목으로 넘어가므로, 성공한 뒤에는 잠금을 풀지 않습니다. */
  protected readonly lock = new SubmitLock({ keepLockedOnSuccess: true });

  protected readonly model = signal({ qty: 0, note: '' });
  protected readonly form = form(this.model, (path) => {
    required(path.qty, { message: '수량을 입력해 주세요.' });
    min(path.qty, 0, { message: '0 이상으로 입력해 주세요.' });
    max(path.qty, 999_999, { message: '수량이 너무 큽니다.' });
    maxLength(path.note, 120, { message: '메모는 120자 이내로 적어 주세요.' });
  });
  protected readonly differs = computed(
    () => !this.blind() && this.model().qty !== this.line().expectedQty,
  );

  ngOnInit(): void {
    const line = this.line();
    this.model.set({
      qty: this.initial() ?? line.countedQty ?? (this.blind() ? 0 : line.expectedQty),
      note: line.note ?? '',
    });
  }

  protected step(delta: number): void {
    this.model.update((value) => ({
      ...value,
      qty: Math.max(0, (Number(value.qty) || 0) + delta),
    }));
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.lock.run(async () => {
      const ok = await submit(this.form, async () => {
        const line = this.line();
        const { qty, note } = this.model();
        await this.outbox.enqueue({
          taskId: line.taskId,
          lineId: line.id,
          skuName: line.sku.name,
          locationCode: line.location.code,
          baseVersion: line.version,
          countedQty: Number(qty),
          note: note.trim(),
        });
        this.saved.emit(Number(qty));
        return undefined;
      });
      // 입력이 잘못되었거나 저장에 실패하면 다시 누를 수 있게 풉니다.
      if (!ok) this.lock.release();
    });
  }
}
