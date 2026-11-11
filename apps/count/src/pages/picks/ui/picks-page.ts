import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ORDER_STATUS_LABEL } from '@sog/domain';
import { NetworkState, WmsHost } from '@/shared/api';
import { DayPipe } from '@/shared/lib';
import { StateMessage } from '@/shared/ui';
import { Progress } from '@/entities/count-task';
import { OperatorSession } from '@/entities/operator';
import { PickApi } from '@/entities/pick-order';

@Component({
  selector: 'cnt-picks-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DayPipe, StateMessage, Progress],
  template: `
    <div class="page">
      <p class="caption">{{ session.operator()?.team }}</p>
      <h1 id="page-title" tabindex="-1" class="title">피킹</h1>
      @if (!network.online()) {
        <p class="offline" role="status">
          피킹은 재고 예약과 맞물려 연결이 필요합니다. 연결되면 목록이 보입니다.
        </p>
      }
      @if (orders.hasValue()) {
        <ul class="cards">
          @for (order of orders.value(); track order.id) {
            <li>
              <a class="card" [routerLink]="['/picks', order.id]">
                <span class="card__top">
                  <span class="mono">{{ order.code }}</span>
                  <span
                    class="pill"
                    [class.pill--warn]="order.status === 'picking'"
                    [class.pill--ok]="order.status === 'picked'"
                    [class.pill--stone]="order.status === 'reserved'"
                    >{{ label[order.status] }}</span
                  >
                </span>
                <span class="card__title">{{ order.customer }}</span>
                <span class="card__meta"
                  >{{ order.units }}개 · {{ order.lineCount }}품목 · 마감
                  {{ order.dueAt | day }}</span
                >
                <cnt-progress [done]="order.pickedAllocations" [total]="order.allocationCount" />
              </a>
            </li>
          } @empty {
            <li class="muted empty">
              배정된 출고 지시가 없습니다. 관리자가 배정하면 여기에 바로 나타납니다.
            </li>
          }
        </ul>
      } @else if (orders.error()) {
        <cnt-state-message
          kind="error"
          message="출고 지시를 불러오지 못했습니다."
          (retry)="orders.reload()"
        />
      } @else {
        <cnt-state-message message="출고 지시를 불러오는 중입니다." />
      }
    </div>
  `,
  styles: `
    .title {
      margin: 0.25rem 0 1.5rem;
      font-size: clamp(2.25rem, 9vw, 3.5rem);
    }
    .title:focus {
      outline: none;
    }
    .offline {
      margin-bottom: 1rem;
      padding: 0.75rem 1rem;
      background: var(--stone);
      font-size: 0.875rem;
    }
    .cards {
      margin: 0;
      padding: 0;
      list-style: none;
      border-top: 1px solid var(--ink);
    }
    .card {
      display: grid;
      gap: 0.5rem;
      padding: 1.25rem 0.25rem;
      border-bottom: 1px solid var(--line);
      text-decoration: none;
    }
    .card:hover {
      background: var(--stone);
    }
    .card__top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8125rem;
    }
    .card__title {
      font-size: 1.375rem;
      font-weight: 500;
      letter-spacing: -0.03em;
    }
    .card__meta {
      font-size: 0.875rem;
      color: var(--ink-soft);
    }
    .empty {
      padding: 1.5rem 0;
    }
  `,
})
export class PicksPage {
  protected readonly session = inject(OperatorSession);
  protected readonly network = inject(NetworkState);
  private readonly api = inject(PickApi);
  protected readonly label = ORDER_STATUS_LABEL;
  protected readonly orders = resource({
    params: () => (this.network.online() ? (this.session.operatorId() ?? undefined) : undefined),
    loader: ({ params }) => this.api.list(params),
  });

  constructor() {
    inject(WmsHost).onChange(['*', 'orders'], () => this.orders.reload());
  }
}
