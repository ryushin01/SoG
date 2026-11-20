/** 조회 모델: 품목·실사·출고 상세, 목록, 창고 도면, 운영 현황 */
import {
  accuracyRate,
  available,
  movementEffect,
  SKU_PAGE_MAX,
  stockStatus,
  variance,
  type CountLine,
  type CountLineView,
  type CountTask,
  type CountTaskDetail,
  type CountTaskSummary,
  type DashboardKpis,
  type Location,
  type LocationDetail,
  type LocationOverview,
  type LocationStatus,
  type Movement,
  type OrderDetail,
  type OrderSummary,
  type Page,
  type ShipmentOrder,
  type Sku,
  type SkuDetail,
  type SkuQuery,
  type SkuSort,
  type SkuSummary,
  type StockLevel,
  type User,
  type Zone,
  type ZoneCode,
} from '@sog/domain';
import { ZONES } from '../seed';
import { intParam } from './http';
import type { ServerScope } from './scope';

export function createViews(scope: ServerScope) {
  const { load, mustGet, now } = scope;

  function summarize(sku: Sku, stocks: StockLevel[]): SkuSummary {
    const own = stocks.filter((stock) => stock.skuId === sku.id);
    const onHand = own.reduce((sum, stock) => sum + stock.onHand, 0);
    const reserved = own.reduce((sum, stock) => sum + stock.reserved, 0);
    return {
      ...sku,
      onHand,
      reserved,
      available: available(onHand, reserved),
      locationCount: own.filter((stock) => stock.onHand > 0).length,
      status: stockStatus(onHand, sku.safetyStock),
    };
  }

  async function skuDetail(id: string): Promise<SkuDetail> {
    const sku = await mustGet<Sku>('skus', id, '품목');
    const [stocks, locations, movements] = await Promise.all([
      load.stocks(),
      load.locations(),
      load.movements(),
    ]);
    const own = stocks
      .filter((stock) => stock.skuId === id)
      .map((stock) => ({ ...stock, location: locations.find((l) => l.id === stock.locationId)! }))
      .sort((a, b) => a.location.code.localeCompare(b.location.code));
    const summary = summarize(sku, stocks);
    return {
      sku,
      stocks: own,
      movements: movements
        .filter((movement) => movement.skuId === id)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 30),
      status: summary.status,
    };
  }

  function netMoved(movements: Movement[], line: CountLine, since: string | null): number {
    if (!since) return 0;
    return movements
      .filter((movement) => movement.skuId === line.skuId && movement.at > since)
      .reduce((sum, movement) => sum + movementEffect(movement, line.locationId), 0);
  }

  async function taskSummary(
    task: CountTask,
    lines?: CountLine[],
    users?: User[],
  ): Promise<CountTaskSummary> {
    const own = (lines ?? (await load.lines())).filter((line) => line.taskId === task.id);
    const assignee = (users ?? (await load.users())).find((user) => user.id === task.assigneeId)!;
    return {
      ...task,
      assignee,
      lineCount: own.length,
      countedCount: own.filter((line) => line.status === 'counted').length,
      recountCount: own.filter((line) => line.status === 'recount').length,
      varianceCount: own.filter((line) => (variance(line) ?? 0) !== 0).length,
    };
  }

  async function lineView(
    line: CountLine,
    ctx?: { skus: Sku[]; locations: Location[]; movements: Movement[] },
  ): Promise<CountLineView> {
    const skus = ctx?.skus ?? (await load.skus());
    const locations = ctx?.locations ?? (await load.locations());
    const movements = ctx?.movements ?? (await load.movements());
    const sku = skus.find((s) => s.id === line.skuId)!;
    return {
      ...line,
      sku: {
        id: sku.id,
        code: sku.code,
        name: sku.name,
        barcode: sku.barcode,
        unit: sku.unit,
        unitCost: sku.unitCost,
        shape: sku.shape,
        hue: sku.hue,
        category: sku.category,
      },
      location: locations.find((l) => l.id === line.locationId)!,
      movedSinceSnapshot: netMoved(movements, line, line.snapshotAt),
      movedSinceCount: netMoved(movements, line, line.countedAt),
    };
  }

  async function taskDetail(id: string): Promise<CountTaskDetail> {
    const task = await mustGet<CountTask>('counts', id, '실사 작업');
    const [lines, skus, locations, movements] = await Promise.all([
      load.lines(),
      load.skus(),
      load.locations(),
      load.movements(),
    ]);
    const own = lines.filter((line) => line.taskId === id);
    const views = await Promise.all(
      own.map((line) => lineView(line, { skus, locations, movements })),
    );
    views.sort(
      (a, b) =>
        a.location.code.localeCompare(b.location.code) || a.sku.code.localeCompare(b.sku.code),
    );
    return { task: await taskSummary(task, lines), lines: views };
  }

  async function listSkus(query: URLSearchParams): Promise<Page<SkuSummary>> {
    const sort = query.get('sort') as SkuSort | null;
    const q: SkuQuery = {
      q: query.get('q') ?? '',
      category: (query.get('category') ?? '') as SkuQuery['category'],
      status: (query.get('status') ?? '') as SkuQuery['status'],
      zone: (query.get('zone') ?? '') as SkuQuery['zone'],
      // 정렬은 정해진 열로만 합니다. 모르는 키는 코드순으로 돌립니다.
      sort: sort && SKU_SORTS.includes(sort) ? sort : 'code',
      dir: query.get('dir') === 'desc' ? 'desc' : 'asc',
      page: intParam(query.get('page'), 1, 1, 10_000),
      size: intParam(query.get('size'), 20, 1, SKU_PAGE_MAX),
    };
    const [skus, stocks, locations] = await Promise.all([
      load.skus(),
      load.stocks(),
      load.locations(),
    ]);
    const needle = q.q!.trim().toLowerCase();
    const zoneOf = new Map(locations.map((location) => [location.id, location.zone]));
    let items = skus.map((sku) => summarize(sku, stocks));
    if (needle) {
      items = items.filter(
        (sku) =>
          sku.name.toLowerCase().includes(needle) ||
          sku.code.toLowerCase().includes(needle) ||
          sku.barcode.includes(needle),
      );
    }
    if (q.category) items = items.filter((sku) => sku.category === q.category);
    if (q.status) items = items.filter((sku) => sku.status === q.status);
    if (q.zone) {
      items = items.filter((sku) =>
        stocks.some((stock) => stock.skuId === sku.id && zoneOf.get(stock.locationId) === q.zone),
      );
    }
    const key = q.sort!;
    const sign = q.dir === 'desc' ? -1 : 1;
    items.sort((a, b) => {
      const av = key === 'value' ? a.onHand * a.unitCost : a[key];
      const bv = key === 'value' ? b.onHand * b.unitCost : b[key];
      const order =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'ko');
      return order * sign || a.code.localeCompare(b.code);
    });
    const start = (q.page! - 1) * q.size!;
    return {
      items: items.slice(start, start + q.size!),
      total: items.length,
      page: q.page!,
      size: q.size!,
    };
  }

  async function locationOverview(): Promise<LocationOverview[]> {
    const [locations, stocks, skus, counts, lines] = await Promise.all([
      load.locations(),
      load.stocks(),
      load.skus(),
      load.counts(),
      load.lines(),
    ]);
    const summaries = new Map(skus.map((sku) => [sku.id, summarize(sku, stocks)]));
    const active = new Map(
      counts
        .filter((task) => ['open', 'in_progress', 'submitted'].includes(task.status))
        .map((t) => [t.id, t.code]),
    );
    const counting = new Map<string, string>();
    for (const line of lines) {
      const code = active.get(line.taskId);
      if (code) counting.set(line.locationId, code);
    }
    const rank: Record<LocationStatus, number> = { empty: 0, ok: 1, low: 2, out: 3 };
    return locations
      .map((location) => {
        const here = stocks.filter((stock) => stock.locationId === location.id);
        const own = here.filter((stock) => stock.onHand > 0);
        let status: LocationStatus = own.length ? 'ok' : 'empty';
        for (const stock of here) {
          const sku = summaries.get(stock.skuId);
          if (!sku) continue;
          // 다 나가 0이 된 기록은 수량·품목 수에는 넣지 않지만, 부족·품절 경고에는 넣습니다.
          if (stock.onHand <= 0 && sku.status === 'ok') continue;
          if (rank[sku.status] > rank[status]) status = sku.status;
        }
        return {
          location,
          units: own.reduce((sum, stock) => sum + stock.onHand, 0),
          value: own.reduce(
            (sum, stock) => sum + stock.onHand * (summaries.get(stock.skuId)?.unitCost ?? 0),
            0,
          ),
          skuCount: own.length,
          status,
          countingTask: counting.get(location.id) ?? null,
        };
      })
      .sort((a, b) => a.location.code.localeCompare(b.location.code));
  }

  async function locationDetail(id: string): Promise<LocationDetail> {
    await mustGet<Location>('locations', id, '로케이션');
    const overview = (await locationOverview()).find((item) => item.location.id === id)!;
    const [stocks, skus] = await Promise.all([load.stocks(), load.skus()]);
    const items = stocks
      .filter((stock) => stock.locationId === id && stock.onHand > 0)
      .map((stock) => ({
        sku: summarize(
          skus.find((sku) => sku.id === stock.skuId)!,
          stocks,
        ),
        onHand: stock.onHand,
        reserved: stock.reserved,
        version: stock.version,
      }))
      .sort((a, b) => b.onHand - a.onHand);
    return { overview, items };
  }

  function orderSummary(order: ShipmentOrder, users: User[]): OrderSummary {
    const allocations = order.lines.flatMap((line) => line.allocations);
    const { lines: _lines, ...rest } = order; // 요약에는 줄 목록을 넣지 않습니다.
    return {
      ...rest,
      assignee: users.find((user) => user.id === order.assigneeId)!,
      lineCount: order.lines.length,
      units: order.lines.reduce((sum, line) => sum + line.qty, 0),
      pickedUnits: allocations.reduce((sum, a) => sum + (a.pickedQty ?? 0), 0),
      pickedAllocations: allocations.filter((a) => a.pickedQty !== null).length,
      allocationCount: allocations.length,
    };
  }

  async function orderDetail(id: string): Promise<OrderDetail> {
    const order = await mustGet<ShipmentOrder>('orders', id, '출고 지시');
    const [users, skus, locations] = await Promise.all([
      load.users(),
      load.skus(),
      load.locations(),
    ]);
    const lines = order.lines.map((line) => {
      const sku = skus.find((s) => s.id === line.skuId)!;
      return {
        id: line.id,
        qty: line.qty,
        sku: {
          id: sku.id,
          code: sku.code,
          name: sku.name,
          barcode: sku.barcode,
          unit: sku.unit,
          shape: sku.shape,
          hue: sku.hue,
          category: sku.category,
        },
        allocations: line.allocations.map((a) => ({
          ...a,
          location: locations.find((l) => l.id === a.locationId)!,
        })),
      };
    });
    const route = lines
      .flatMap((line) => line.allocations.map((a) => ({ ...a, lineId: line.id, sku: line.sku })))
      .sort((a, b) => a.location.code.localeCompare(b.location.code));
    return { order: orderSummary(order, users), lines, route };
  }

  async function dashboard(): Promise<DashboardKpis> {
    const [skus, stocks, movements, counts, lines, locations, orders] = await Promise.all([
      load.skus(),
      load.stocks(),
      load.movements(),
      load.counts(),
      load.lines(),
      load.locations(),
      load.orders(),
    ]);
    const summaries = skus.map((sku) => summarize(sku, stocks));
    const costOf = new Map(skus.map((sku) => [sku.id, sku.unitCost]));
    const zoneOf = new Map(locations.map((location) => [location.id, location.zone]));
    const today = now();
    const flow: DashboardKpis['flow'] = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date(today.getTime() - i * 86_400_000);
      const date = day.toISOString().slice(0, 10);
      const ofDay = movements.filter((movement) => movement.at.slice(0, 10) === date);
      flow.push({
        date,
        receipt: ofDay.filter((m) => m.type === 'receipt').reduce((sum, m) => sum + m.qty, 0),
        shipment: ofDay.filter((m) => m.type === 'shipment').reduce((sum, m) => sum + m.qty, 0),
      });
    }
    const zoneValue = zonesIn(locations).map(({ code }) => {
      const own = stocks.filter((stock) => zoneOf.get(stock.locationId) === code);
      return {
        zone: code as ZoneCode,
        units: own.reduce((sum, stock) => sum + stock.onHand, 0),
        value: own.reduce((sum, stock) => sum + stock.onHand * (costOf.get(stock.skuId) ?? 0), 0),
      };
    });
    const lastApproved = counts
      .filter((task) => task.status === 'approved')
      .sort((a, b) => (b.approvedAt ?? '').localeCompare(a.approvedAt ?? ''))[0];
    return {
      skuCount: skus.length,
      totalUnits: summaries.reduce((sum, sku) => sum + sku.onHand, 0),
      inventoryValue: summaries.reduce((sum, sku) => sum + sku.onHand * sku.unitCost, 0),
      lowStock: summaries.filter((sku) => sku.status === 'low').length,
      outOfStock: summaries.filter((sku) => sku.status === 'out').length,
      openCounts: counts.filter((task) => task.status === 'open' || task.status === 'in_progress')
        .length,
      pendingReview: counts.filter((task) => task.status === 'submitted').length,
      pendingOrders: orders.filter((order) =>
        ['reserved', 'picking', 'picked'].includes(order.status),
      ).length,
      accuracy: lastApproved
        ? accuracyRate(lines.filter((line) => line.taskId === lastApproved.id))
        : null,
      flow,
      zoneValue,
    };
  }

  return {
    summarize,
    skuDetail,
    netMoved,
    taskSummary,
    lineView,
    taskDetail,
    listSkus,
    locationOverview,
    locationDetail,
    orderSummary,
    orderDetail,
    dashboard,
  };
}

export type Views = ReturnType<typeof createViews>;

/**
 * 저장된 로케이션이 있는 구역만 돌려줍니다. 실제 서버는 시드 버전이 바뀌어도 저장된 데이터를 지우지 않아
 * (매일 초기화를 끈 운영 등) 옛 데이터에는 새로 더한 구역의 로케이션이 없을 수 있습니다.
 */
export function zonesIn(locations: readonly Location[]): Zone[] {
  return ZONES.filter((zone) => locations.some((location) => location.zone === zone.code));
}

const SKU_SORTS: readonly SkuSort[] = ['code', 'name', 'onHand', 'available', 'value', 'updatedAt'];
