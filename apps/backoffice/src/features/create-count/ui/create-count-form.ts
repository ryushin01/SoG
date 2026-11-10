import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import type { CountTask, ZoneCode } from '@sog/domain';
import { idempotencyKey, SubmitLock, toApiError } from '@/shared/api';
import { FieldErrors, Toaster } from '@/shared/ui';
import { CountApi } from '@/entities/count';
import { LocationDirectory } from '@/entities/location';
import { Session } from '@/entities/user';

function tomorrow(): string {
  const date = new Date(Date.now() + 86_400_000);
  return date.toISOString().slice(0, 10);
}

/** 실사 작업 만들기. 구역의 재고를 지금 수량으로 찍어 두고 작업자에게 배정합니다. */
@Component({
  selector: 'sog-create-count-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldErrors],
  template: `
    <form class="stack" novalidate (submit)="onSubmit($event)">
      <div class="field">
        <label class="field__label" for="count-title">작업 이름</label>
        <input
          id="count-title"
          class="input"
          autocomplete="off"
          [formField]="form.title"
          [attr.aria-invalid]="form.title().touched() && form.title().invalid()"
          aria-describedby="count-title-error"
        />
        <sog-field-errors [state]="form.title()" id="count-title-error" />
      </div>

      <div class="grid">
        <div class="field">
          <label class="field__label" for="count-zone">구역</label>
          <select id="count-zone" class="select" [formField]="form.zone">
            @for (zone of directory.zones(); track zone.code) {
              <option [value]="zone.code">{{ zone.name }} · {{ zone.condition }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="count-assignee">담당 작업자</label>
          <select
            id="count-assignee"
            class="select"
            [formField]="form.assigneeId"
            [attr.aria-invalid]="form.assigneeId().touched() && form.assigneeId().invalid()"
            aria-describedby="count-assignee-error"
          >
            <option value="">선택</option>
            @for (user of session.operators(); track user.id) {
              <option [value]="user.id">{{ user.name }} · {{ user.team }}</option>
            }
          </select>
          <sog-field-errors [state]="form.assigneeId()" id="count-assignee-error" />
        </div>
        <div class="field">
          <label class="field__label" for="count-due">마감일</label>
          <input
            id="count-due"
            class="input"
            type="date"
            [formField]="form.dueAt"
            [attr.aria-invalid]="form.dueAt().touched() && form.dueAt().invalid()"
            aria-describedby="count-due-error"
          />
          <sog-field-errors [state]="form.dueAt()" id="count-due-error" />
        </div>
      </div>

      <label class="check">
        <input type="checkbox" [formField]="form.blind" aria-describedby="count-blind-hint" />
        블라인드 실사
      </label>
      <p id="count-blind-hint" class="field__hint">
        작업자에게 장부 수량을 보여 주지 않아, 장부를 보고 맞춰 적는 일을 막습니다.
      </p>

      @if (serverError(); as message) {
        <p class="field__error" role="alert">{{ message }}</p>
      }

      <button type="submit" class="btn btn--primary" [disabled]="lock.pending()">
        {{ lock.pending() ? '만드는 중…' : '작업 만들고 배정' }}
      </button>
    </form>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      gap: 1rem;
    }
  `,
})
export class CreateCountForm {
  readonly created = output<CountTask>();
  private readonly api = inject(CountApi);
  private readonly toaster = inject(Toaster);
  protected readonly directory = inject(LocationDirectory);
  protected readonly session = inject(Session);
  protected readonly lock = new SubmitLock({ keepLockedOnSuccess: true });
  private readonly key = idempotencyKey();
  protected readonly serverError = signal<string | null>(null);

  protected readonly model = signal({
    title: '순환 실사',
    zone: 'A' as ZoneCode,
    assigneeId: '',
    dueAt: tomorrow(),
    blind: true,
  });
  protected readonly form = form(this.model, (path) => {
    required(path.title, { message: '작업 이름을 입력해 주세요.' });
    maxLength(path.title, 60, { message: '작업 이름은 60자 이내로 입력해 주세요.' });
    required(path.assigneeId, { message: '담당 작업자를 선택해 주세요.' });
    required(path.dueAt, { message: '마감일을 입력해 주세요.' });
  });

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.lock.run(async () => {
      let ok = false;
      await submit(this.form, async () => {
        this.serverError.set(null);
        try {
          const value = this.model();
          const task = await this.api.create(
            { ...value, dueAt: `${value.dueAt}T18:00:00+09:00` },
            this.key,
          );
          ok = true;
          this.toaster.show(
            `${task.code}을(를) 만들었습니다.${task.skipped ? ` 다른 실사에 들어 있는 ${task.skipped}건은 뺐습니다.` : ''}`,
            'success',
          );
          this.created.emit(task);
        } catch (error) {
          this.serverError.set(toApiError(error).message);
        }
        return undefined;
      });
      if (!ok) this.lock.release();
    });
  }
}
