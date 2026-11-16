import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  type LocationDetail,
  type LocationOverview,
  type LocationStatus,
  type Page,
  type SkuDetail,
  type SkuSummary,
  ZONE_LABEL,
  type ZoneCode,
} from '@sog/domain';
import { WmsHost } from '@/shared/api';
import { NumPipe, WonPipe } from '@/shared/lib';
import { PageHeader, StateMessage } from '@/shared/ui';
import { LocationDirectory } from '@/entities/location';
import { SkuArt, StockStatusBadge } from '@/entities/sku';

const STATUS_TEXT: Record<LocationStatus, string> = {
  empty: '비어 있음',
  ok: '정상',
  low: '부족 품목 있음',
  out: '품절 품목 있음',
};

interface Rack {
  rack: number;
  /** 위쪽 단부터 */
  cells: LocationOverview[];
}

interface Aisle {
  aisle: number;
  racks: Rack[];
}

@Component({
  selector: 'sog-warehouse-map-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NumPipe, WonPipe, PageHeader, StateMessage, SkuArt, StockStatusBadge],
  templateUrl: './warehouse-map-page.html',
  styleUrl: './warehouse-map-page.css',
})
export class WarehouseMapPage {
  /** 고른 로케이션(쿼리 ?loc=). 주소로 공유하거나 새로 고침해도 남습니다. */
  readonly loc = input<string>('');
  /** 찾는 품목(쿼리 ?sku=). 품목 상세의 "도면에서 보기"가 여기로 옵니다. */
  readonly sku = input<string>('');
  private readonly router = inject(Router);
  protected readonly directory = inject(LocationDirectory);
  protected readonly statusText = STATUS_TEXT;
  protected readonly zoneLabel = ZONE_LABEL;

  protected readonly overview = httpResource<{ items: LocationOverview[] }>(
    () => '/api/locations/overview',
  );
  protected readonly items = linkedSignal<
    { items: LocationOverview[] } | undefined,
    LocationOverview[] | undefined
  >({
    source: () => (this.overview.hasValue() ? this.overview.value() : undefined),
    computation: (value, previous) => value?.items ?? previous?.value,
  });
  protected readonly selectedId = linkedSignal(() => this.loc() ?? '');
  protected readonly detail = httpResource<LocationDetail>(() =>
    this.selectedId() ? `/api/locations/${encodeURIComponent(this.selectedId())}` : undefined,
  );

  /** 품목 찾기: 고를 수 있는 품목(이름순, 데모는 48종이라 한 번에 받음) */
  protected readonly skuOptions = httpResource<Page<SkuSummary>>(() => ({
    url: '/api/skus',
    params: { size: 100, sort: 'name' },
  }));
  protected readonly skuId = linkedSignal(() => this.sku() ?? '');
  protected readonly found = httpResource<SkuDetail>(() =>
    this.skuId() ? `/api/skus/${encodeURIComponent(this.skuId())}` : undefined,
  );
  /** 찾는 품목이 있는 로케이션과 그 칸의 수량 */
  protected readonly foundAt = computed(() => {
    const detail = this.found.hasValue() ? this.found.value() : undefined;
    if (!detail || detail.sku.id !== this.skuId()) return new Map<string, number>();
    return new Map(
      detail.stocks.filter((stock) => stock.onHand > 0).map((s) => [s.locationId, s.onHand]),
    );
  });
  /** 찾은 결과 안내(화면 낭독기에 바뀐 내용을 읽어 줌) */
  protected readonly foundText = computed(() => {
    const detail = this.found.hasValue() ? this.found.value() : undefined;
    if (!this.skuId() || !detail || detail.sku.id !== this.skuId()) return '';
    const cells = this.foundAt();
    if (cells.size === 0) return `${detail.sku.name}: 지금 보관 중인 칸이 없습니다.`;
    const units = [...cells.values()].reduce((sum, qty) => sum + qty, 0);
    return `${detail.sku.name}: ${cells.size}칸에 ${units.toLocaleString('ko-KR')}${detail.sku.unit}`;
  });

  protected readonly maxUnits = computed(() =>
    Math.max(1, ...(this.items() ?? []).map((item) => item.units)),
  );

  /** 구역 → 통로 → 랙 → 단. 실제 배치처럼 위쪽 단을 위에 그립니다. */
  protected readonly zones = computed(() => {
    const items = this.items() ?? [];
    const zones = new Map<ZoneCode, Aisle[]>();
    for (const item of items) {
      const { zone, aisle, rack } = item.location;
      const aisles = zones.get(zone) ?? [];
      let a = aisles.find((x) => x.aisle === aisle);
      if (!a) aisles.push((a = { aisle, racks: [] }));
      let r = a.racks.find((x) => x.rack === rack);
      if (!r) a.racks.push((r = { rack, cells: [] }));
      r.cells.push(item);
      zones.set(zone, aisles);
    }
    for (const aisles of zones.values()) {
      aisles.sort((a, b) => a.aisle - b.aisle);
      for (const a of aisles) {
        a.racks.sort((x, y) => x.rack - y.rack);
        for (const r of a.racks) r.cells.sort((x, y) => y.location.level - x.location.level);
      }
    }
    return [...zones.entries()].map(([code, aisles]) => {
      const cells = aisles.flatMap((a) => a.racks.flatMap((r) => r.cells));
      return {
        code,
        aisles,
        units: cells.reduce((sum, c) => sum + c.units, 0),
        used: cells.filter((c) => c.units > 0).length,
        total: cells.length,
      };
    });
  });

  protected readonly summary = computed(() => {
    const items = this.items() ?? [];
    return {
      empty: items.filter((i) => i.status === 'empty').length,
      alert: items.filter((i) => i.status === 'low' || i.status === 'out').length,
      counting: items.filter((i) => i.countingTask).length,
    };
  });

  constructor() {
    inject(WmsHost).onChange(['*', 'skus', 'counts'], () => {
      this.overview.reload();
      if (this.selectedId()) this.detail.reload();
      if (this.skuId()) this.found.reload();
    });
  }

  protected select(id: string): void {
    const next = this.selectedId() === id ? '' : id;
    this.selectedId.set(next);
    void this.router.navigate([], {
      queryParams: { loc: next || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected findSku(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.skuId.set(id);
    void this.router.navigate([], {
      queryParams: { sku: id || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected fill(cell: LocationOverview): number {
    return cell.units === 0 ? 0 : Math.max(6, (cell.units / this.maxUnits()) * 100);
  }

  /** 칸 이름 뒤에 붙는 숨김 설명: 개수 단위, 품목 수, 상태, 실사 중 */
  protected detailText(cell: LocationOverview): string {
    const parts = [`개, 품목 ${cell.skuCount}종`];
    if (cell.status === 'low' || cell.status === 'out') parts.push(STATUS_TEXT[cell.status]);
    if (cell.status === 'empty') parts.push('비어 있음');
    if (cell.countingTask) parts.push(`실사 중 ${cell.countingTask}`);
    const found = this.foundAt().get(cell.location.id);
    if (found !== undefined) parts.push(`찾는 품목 ${found}개`);
    return parts.join(', ');
  }
}
