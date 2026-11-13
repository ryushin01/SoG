import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { form, FormField, maxLength, min, required, submit } from '@angular/forms/signals';
import { formatNumber, type Sku, type SkuDetail } from '@sog/domain';
import { isVersionConflict, Presence, SubmitLock, toApiError } from '@/shared/api';
import { FieldErrors, Toaster } from '@/shared/ui';
import { SkuApi } from '@/entities/sku';
import { Session } from '@/entities/user';

export interface SkuModel {
  name: string;
  safetyStock: number;
  unitCost: number;
  description: string;
}

const FIELDS: { key: keyof SkuModel; label: string }[] = [
  { key: 'name', label: '품목명' },
  { key: 'safetyStock', label: '안전 재고' },
  { key: 'unitCost', label: '단가' },
  { key: 'description', label: '설명' },
];

function toModel(sku: Sku): SkuModel {
  return {
    name: sku.name,
    safetyStock: sku.safetyStock,
    unitCost: sku.unitCost,
    description: sku.description,
  };
}

function same(a: SkuModel, b: SkuModel): boolean {
  return FIELDS.every(({ key }) => a[key] === b[key]);
}

/**
 * 품목 정보 수정.
 * 불러온 버전을 If-Match로 보내고, 그사이 다른 사용자가 저장했다면(412) 두 값을 나란히 보여 주고 고르게 합니다.
 * 수정 중에 다른 탭의 변경이 오면 입력을 덮어쓰지 않고 알려만 줍니다.
 */
@Component({
  selector: 'sog-edit-sku-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FieldErrors],
  templateUrl: './edit-sku-form.html',
  styleUrl: './edit-sku-form.css',
})
export class EditSkuForm {
  readonly detail = input.required<SkuDetail>();
  /** 변경 이력에서 불러온 값. 바뀔 때마다 폼에 채우고, 저장은 사용자가 확인한 뒤 버전 검사를 거쳐 합니다. */
  readonly restore = input<{ values: Partial<SkuModel>; label: string } | null>(null);
  readonly saved = output<Sku>();
  /** 버전 충돌로 저장이 막혔을 때. 서버가 막힌 시도를 변경 이력에 남깁니다. */
  readonly conflicted = output<void>();

  private readonly api = inject(SkuApi);
  private readonly toaster = inject(Toaster);
  protected readonly session = inject(Session);
  protected readonly lock = new SubmitLock();

  /** 편집을 시작한 기준(서버 값과 버전) */
  protected readonly base = signal<Sku | null>(null);
  protected readonly model = signal<SkuModel>({
    name: '',
    safetyStock: 0,
    unitCost: 0,
    description: '',
  });
  protected readonly form = form(this.model, (path) => {
    required(path.name, { message: '품목명을 입력해 주세요.' });
    maxLength(path.name, 60, { message: '품목명은 60자 이내로 입력해 주세요.' });
    min(path.safetyStock, 0, { message: '안전 재고는 0 이상이어야 합니다.' });
    min(path.unitCost, 0, { message: '단가는 0 이상이어야 합니다.' });
    maxLength(path.description, 500, { message: '설명은 500자 이내로 입력해 주세요.' });
  });

  protected readonly dirty = computed(() => {
    const base = this.base();
    return base !== null && !same(this.model(), toModel(base));
  });
  /** 수정하는 동안 다른 사용자가 바꾼 최신 값 */
  protected readonly incoming = signal<Sku | null>(null);
  /** 저장이 버전 충돌로 거절됐을 때의 최신 값 */
  protected readonly conflict = signal<Sku | null>(null);
  protected readonly serverError = signal<string | null>(null);
  protected readonly fields = FIELDS;

  protected readonly conflictRows = computed(() => {
    const latest = this.conflict();
    if (!latest) return [];
    const mine = this.model();
    const theirs = toModel(latest);
    return FIELDS.filter(({ key }) => mine[key] !== theirs[key]).map(({ key, label }) => ({
      label,
      mine: this.display(key, mine[key]),
      theirs: this.display(key, theirs[key]),
    }));
  });

  constructor() {
    effect(() => {
      const restore = this.restore();
      if (!restore) return;
      untracked(() => {
        this.model.update((value) => ({ ...value, ...restore.values }));
        this.toaster.show(
          `${restore.label} 값을 폼에 불러왔습니다. 확인한 뒤 저장해 주세요.`,
          'info',
        );
      });
    });
    // 이 품목을 보고 있다는 것과, 저장하지 않은 입력이 있으면 수정 중이라는 것을 다른 탭에 알립니다.
    inject(Presence).track(
      () => `skus/${this.detail().sku.id}`,
      () => ({ editing: this.dirty() }),
    );
    effect(() => {
      const sku = this.detail().sku;
      untracked(() => {
        const base = this.base();
        if (base === null || !this.dirty()) {
          this.load(sku);
        } else if (sku.version !== base.version) {
          this.incoming.set(sku);
        }
      });
    });
  }

  protected id(name: string): string {
    return `edit-sku-${name}`;
  }

  protected display(key: keyof SkuModel, value: string | number): string {
    if (key === 'unitCost') return `${formatNumber(Number(value))}원`;
    if (typeof value === 'number') return formatNumber(value);
    return value || '(비어 있음)';
  }

  protected load(sku: Sku): void {
    this.base.set(sku);
    this.model.set(toModel(sku));
    this.form().reset();
    this.incoming.set(null);
    this.conflict.set(null);
    this.serverError.set(null);
  }

  /** 내 입력은 두고, 최신 버전을 기준으로 다시 저장합니다. */
  protected keepMine(): void {
    const latest = this.conflict();
    if (!latest) return;
    this.base.set(latest);
    this.conflict.set(null);
    void this.save();
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.save();
  }

  private async save(): Promise<void> {
    await this.lock.run(() =>
      submit(this.form, async () => {
        const base = this.base();
        if (!base) return undefined;
        this.serverError.set(null);
        try {
          const updated = await this.api.update(base.id, base.version, this.model());
          this.load(updated);
          this.toaster.show(`${updated.name} 정보를 저장했습니다.`, 'success');
          this.saved.emit(updated);
        } catch (error) {
          const apiError = toApiError(error);
          if (isVersionConflict(apiError)) {
            this.conflict.set((apiError.current as SkuDetail).sku);
            this.incoming.set(null);
            this.conflicted.emit();
          } else {
            this.serverError.set(apiError.message);
          }
        }
        return undefined;
      }),
    );
  }
}
