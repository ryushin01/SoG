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
import { Router, RouterLink } from '@angular/router';
import { type ArtView, CATEGORY_LABEL, skuArtUrl, ZONE_LABEL } from '@sog/domain';
import { Presence, WmsHost } from '@/shared/api';
import { AgoPipe } from '@/shared/lib';
import { StateMessage } from '@/shared/ui';
import {
  LINE_STATE_LABEL,
  LINE_STATE_TONE,
  lineState,
  TaskRepository,
} from '@/entities/count-task';
import { OperatorSession } from '@/entities/operator';
import { Outbox } from '@/entities/outbox';
import { PeerNotice } from '@/features/show-presence';
import { CountForm } from '@/features/submit-count';

const VIEWS: { view: ArtView; label: string }[] = [
  { view: 'front', label: '정면' },
  { view: 'angle', label: '측면' },
  { view: 'label', label: '라벨 확대' },
];

/** 품목 실사 화면: 큰 품목 사진, 같은 품목의 다른 로케이션, 수량 입력, 접히는 상세 정보 */
@Component({
  selector: 'cnt-line-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AgoPipe, StateMessage, CountForm, PeerNotice],
  templateUrl: './line-page.html',
  styleUrl: './line-page.css',
})
export class LinePage {
  readonly taskId = input.required<string>();
  readonly lineId = input.required<string>();
  private readonly repo = inject(TaskRepository);
  private readonly router = inject(Router);
  protected readonly outbox = inject(Outbox);
  protected readonly session = inject(OperatorSession);
  protected readonly categoryLabel = CATEGORY_LABEL;
  protected readonly zoneLabel = ZONE_LABEL;
  protected readonly stateLabel = LINE_STATE_LABEL;
  protected readonly stateTone = LINE_STATE_TONE;
  protected readonly views = VIEWS;
  protected readonly activeView = signal(0);
  protected readonly savedMessage = signal<string | null>(null);

  protected readonly detail = resource({
    params: () => this.taskId(),
    loader: ({ params }) => this.repo.detail(params),
  });
  protected readonly task = computed(
    () => (this.detail.hasValue() ? this.detail.value() : undefined)?.data.task ?? null,
  );
  protected readonly lines = computed(
    () => (this.detail.hasValue() ? this.detail.value() : undefined)?.data.lines ?? [],
  );
  protected readonly line = computed(
    () => this.lines().find((line) => line.id === this.lineId()) ?? null,
  );
  protected readonly queued = computed(() => this.outbox.forLine(this.lineId()));
  protected readonly state = computed(() => {
    const line = this.line();
    return line ? lineState(line, this.queued()) : 'pending';
  });
  protected readonly images = computed(() => {
    const line = this.line();
    return line ? VIEWS.map((v) => ({ ...v, src: skuArtUrl(line.sku, v.view) })) : [];
  });
  /** 같은 품목이 이 작업의 다른 로케이션에도 있으면 스와치로 보여 줍니다. */
  protected readonly siblings = computed(() => {
    const line = this.line();
    if (!line) return [];
    return this.lines().filter((other) => other.sku.id === line.sku.id);
  });
  protected readonly position = computed(() => {
    const index = this.lines().findIndex((line) => line.id === this.lineId());
    return { index: index + 1, total: this.lines().length };
  });
  protected readonly editable = computed(() =>
    ['open', 'in_progress'].includes(this.task()?.status ?? ''),
  );

  constructor() {
    // 어느 품목 앞에 있는지 알려, 다른 작업자와 백오피스가 실시간으로 볼 수 있게 합니다.
    inject(Presence).track(
      () => `counts/${this.taskId()}/lines/${this.lineId()}`,
      () => {
        const line = this.line();
        return { detail: line ? `${line.location.code} ${line.sku.name}` : '' };
      },
    );
    const title = inject(Title);
    effect(() => {
      const line = this.line();
      if (line) title.setTitle(`${line.sku.name} ${line.location.code} · SoG 재고 실사`);
    });
    effect(() => {
      this.lineId();
      this.activeView.set(0);
    });
    inject(WmsHost).onChange(['*', 'counts'], (event) => {
      if (event.topics.includes('*') || event.topics.includes(`counts/${this.taskId()}`))
        this.detail.reload();
    });
  }

  protected showView(index: number, gallery: HTMLElement): void {
    this.activeView.set(index);
    const slide = gallery.children[index] as HTMLElement | undefined;
    gallery.scrollTo({ left: slide?.offsetLeft ?? 0, behavior: 'smooth' });
  }

  protected onScroll(gallery: HTMLElement): void {
    const index = Math.round(gallery.scrollLeft / Math.max(1, gallery.clientWidth));
    if (index !== this.activeView()) this.activeView.set(index);
  }

  /** 저장하면 다음에 셀 품목으로 넘어가고, 다 셌으면 작업 화면으로 돌아갑니다. */
  protected next(qty: number): void {
    const lines = this.lines();
    const current = lines.findIndex((line) => line.id === this.lineId());
    const remaining = [...lines.slice(current + 1), ...lines.slice(0, current)].find((line) => {
      const state = lineState(line, this.outbox.forLine(line.id));
      return state === 'pending' || state === 'recount' || state === 'conflict';
    });
    const sku = this.line()?.sku;
    this.savedMessage.set(`${sku?.name ?? ''} ${qty}${sku?.unit ?? ''}을(를) 저장했습니다.`);
    if (remaining) void this.router.navigate(['/tasks', this.taskId(), 'lines', remaining.id]);
    else void this.router.navigate(['/tasks', this.taskId()]);
  }
}
