import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { ORDER_STATUS_LABEL, skuArtUrl } from '@sog/domain';
import { NetworkState, Presence, WmsHost } from '@/shared/api';
import { StateMessage } from '@/shared/ui';
import { Progress } from '@/entities/count-task';
import { PickApi } from '@/entities/pick-order';
import { PickForm } from '@/features/pick-item';
import { PeerNotice } from '@/features/show-presence';

/** 피킹 동선: 로케이션 순서로 할당을 보여 주고, 하나씩 펼쳐 집은 수량을 확인합니다. */
@Component({
  selector: 'cnt-pick-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, StateMessage, Progress, PickForm, PeerNotice],
  templateUrl: './pick-page.html',
  styleUrl: './pick-page.css',
})
export class PickPage {
  readonly orderId = input.required<string>();
  private readonly api = inject(PickApi);
  protected readonly network = inject(NetworkState);
  protected readonly label = ORDER_STATUS_LABEL;
  protected readonly open = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly detail = resource({
    params: () => this.orderId(),
    loader: ({ params }) => this.api.detail(params),
  });
  protected readonly data = computed(() =>
    this.detail.hasValue() ? this.detail.value() : undefined,
  );
  protected readonly route = computed(() =>
    (this.data()?.route ?? []).map((item) => ({ ...item, art: skuArtUrl(item.sku) })),
  );
  protected readonly editable = computed(() =>
    ['reserved', 'picking'].includes(this.data()?.order.status ?? ''),
  );

  constructor() {
    inject(Presence).track(
      () => `orders/${this.orderId()}`,
      () => {
        const item = this.route().find((a) => a.id === this.open());
        return { detail: item ? `${item.location.code} ${item.sku.name}` : '' };
      },
    );
    const title = inject(Title);
    effect(() => {
      const order = this.data()?.order;
      if (order) title.setTitle(`${order.code} 피킹 · SoG 재고 실사`);
    });
    // 처음에는 아직 집지 않은 첫 할당을 펼칩니다.
    effect(() => {
      const route = this.route();
      if (this.open() === null && route.length) {
        this.open.set(route.find((a) => a.pickedQty === null)?.id ?? null);
      }
    });
    inject(WmsHost).onChange(['*', 'orders'], (event) => {
      if (event.topics.includes('*') || event.topics.includes(`orders/${this.orderId()}`))
        this.detail.reload();
    });
  }

  protected toggle(id: string): void {
    this.open.set(this.open() === id ? '' : id);
  }

  protected picked(currentId: string): void {
    this.notice.set(null);
    const route = this.route();
    const index = route.findIndex((a) => a.id === currentId);
    const next = [...route.slice(index + 1), ...route.slice(0, index)].find(
      (a) => a.pickedQty === null,
    );
    this.open.set(next?.id ?? '');
    this.detail.reload();
  }

  protected stale(message: string): void {
    this.notice.set(message);
    this.detail.reload();
  }
}
