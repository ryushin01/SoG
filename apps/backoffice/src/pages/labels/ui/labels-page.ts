import { DOCUMENT } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CATEGORY_LABEL, SKU_PAGE_MAX, type Page, type SkuSummary } from '@sog/domain';
import { SkuBarcode } from '@/entities/sku';
import { PageHeader, StateMessage } from '@/shared/ui';

type Layout = 'sheet' | 'roll';

/** 라벨 크기. A4 용지는 한 장에 3×8칸, 라벨 프린터는 라벨 하나가 한 쪽입니다. */
const LAYOUTS: { value: Layout; label: string; perPage: number }[] = [
  { value: 'sheet', label: 'A4 라벨 용지 24칸 (64×33.9mm)', perPage: 24 },
  { value: 'roll', label: '라벨 프린터 (50×30mm)', perPage: 1 },
];

/** 품목당 장수 상한(한 번에 너무 많이 그리지 않게) */
const MAX_COPIES = 20;

function copiesOf(raw: string | undefined): number {
  const value = Math.trunc(Number(raw));
  return Number.isFinite(value) ? Math.min(MAX_COPIES, Math.max(1, value)) : 1;
}

/**
 * 바코드 라벨 인쇄. 품목 상세(그 품목)나 재고 목록(지금 필터 그대로)에서 옵니다.
 * 라벨은 EAN-13 바코드와 품목 이름·코드·단위이고, 현장 앱 카메라와 산업용 스캐너로 그대로 읽힙니다.
 * 인쇄할 때는 메뉴·머리글·설정을 감추고 라벨만 정한 크기(mm)로 냅니다(styles.css의 print-labels).
 */
@Component({
  selector: 'sog-labels-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink, SkuBarcode, StateMessage],
  templateUrl: './labels-page.html',
  styleUrl: './labels-page.css',
})
export class LabelsPage {
  /** 쉼표로 이은 품목 ID. 없으면 아래 재고 필터로 고른 품목 모두 */
  readonly sku = input<string>('');
  readonly q = input<string>('');
  readonly status = input<string>('');
  readonly category = input<string>('');
  readonly zone = input<string>('');
  readonly layout = input<string>('');
  readonly copies = input<string>('');

  private readonly router = inject(Router);
  protected readonly layouts = LAYOUTS;
  protected readonly maxCopies = MAX_COPIES;
  protected readonly categoryLabel = CATEGORY_LABEL;

  protected readonly layoutChoice = linkedSignal<Layout>(() =>
    this.layout() === 'roll' ? 'roll' : 'sheet',
  );
  protected readonly copiesChoice = linkedSignal(() => copiesOf(this.copies()));

  private readonly ids = computed(() => (this.sku() ?? '').split(',').filter(Boolean));
  private readonly filters = computed(() => {
    const params: Record<string, string> = {};
    for (const [key, value] of [
      ['q', this.q()],
      ['status', this.status()],
      ['category', this.category()],
      ['zone', this.zone()],
    ] as const) {
      if (value) params[key] = value;
    }
    return params;
  });

  protected readonly list = httpResource<Page<SkuSummary>>(() => ({
    url: '/api/skus',
    // 품목을 골라 왔으면 전체에서 고르고, 아니면 재고 화면의 필터를 그대로 씁니다.
    params: {
      size: SKU_PAGE_MAX,
      sort: 'code',
      ...(this.ids().length ? {} : this.filters()),
    },
  }));

  protected readonly items = computed(() => {
    if (!this.list.hasValue()) return [];
    const all = this.list.value().items;
    const ids = this.ids();
    if (ids.length === 0) return all;
    return ids
      .map((id) => all.find((sku) => sku.id === id))
      .filter((sku): sku is SkuSummary => !!sku);
  });

  protected readonly labels = computed(() =>
    this.items().flatMap((sku) =>
      Array.from({ length: this.copiesChoice() }, (_, i) => ({ key: `${sku.id}-${i}`, sku })),
    ),
  );

  protected readonly pages = computed(() => {
    const perPage = LAYOUTS.find((layout) => layout.value === this.layoutChoice())!.perPage;
    return Math.ceil(this.labels().length / perPage);
  });

  /** 품목 상세에서 한 품목만 골라 왔을 때의 그 품목(돌아갈 곳·경로 표시) */
  protected readonly single = computed(() =>
    this.ids().length === 1 ? (this.items()[0] ?? null) : null,
  );
  /** 재고 목록에서 왔으면 같은 필터로 돌아갑니다. */
  protected readonly backParams = computed(() => this.filters());

  constructor() {
    // 인쇄할 때 메뉴·머리글을 감추는 표시. 이 화면을 떠나면 지웁니다.
    const body = inject(DOCUMENT).body;
    body.classList.add('print-labels');
    inject(DestroyRef).onDestroy(() => body.classList.remove('print-labels'));
    // 라벨 크기·장수도 주소에 남겨 새로 고침·공유 때 그대로 엽니다.
    effect(() => {
      const queryParams = {
        layout: this.layoutChoice() === 'roll' ? 'roll' : null,
        copies: this.copiesChoice() > 1 ? this.copiesChoice() : null,
      };
      void this.router.navigate([], {
        queryParams,
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  }

  protected setLayout(value: string): void {
    this.layoutChoice.set(value === 'roll' ? 'roll' : 'sheet');
  }

  protected setCopies(input: HTMLInputElement): void {
    this.copiesChoice.set(copiesOf(input.value));
    // 범위를 벗어난 값은 고친 값으로 다시 보여 줍니다(고친 값이 이전과 같으면 바인딩이 칸을 바꾸지 않음).
    input.value = String(this.copiesChoice());
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected print(): void {
    window.print();
  }
}
