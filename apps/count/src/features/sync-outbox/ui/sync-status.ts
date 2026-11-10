import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NetworkState } from '@/shared/api';
import { Outbox } from '@/entities/outbox';

/** 연결 상태와 보낼함. 색만이 아니라 글자로 상태를 적습니다. */
@Component({
  selector: 'cnt-sync-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <a class="sync" routerLink="/settings" [attr.data-tone]="tone()">
      <span class="sync__dot" aria-hidden="true"></span>
      <span>{{ label() }}</span>
      <span class="visually-hidden">: 보낼함과 설정 보기</span>
    </a>
  `,
  styles: `
    .sync {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      min-height: 2.75rem;
      padding: 0 0.75rem;
      border: 1px solid var(--line-strong);
      border-radius: 999px;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      letter-spacing: -0.02em;
      text-transform: uppercase;
      text-decoration: none;
      white-space: nowrap;
    }
    .sync__dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: var(--ok);
    }
    [data-tone='offline'] .sync__dot {
      background: var(--ink-soft);
    }
    [data-tone='offline'] {
      background: var(--stone);
    }
    [data-tone='waiting'] .sync__dot {
      background: var(--warn);
    }
    [data-tone='conflict'] {
      border-color: var(--wine);
      color: var(--wine);
    }
    [data-tone='conflict'] .sync__dot {
      background: var(--wine);
    }
  `,
})
export class SyncStatus {
  private readonly network = inject(NetworkState);
  private readonly outbox = inject(Outbox);

  protected readonly tone = computed(() => {
    if (this.outbox.conflicts().length > 0) return 'conflict';
    if (!this.network.online()) return 'offline';
    if (this.outbox.waiting().length > 0) return 'waiting';
    return 'online';
  });

  protected readonly label = computed(() => {
    const waiting = this.outbox.waiting().length;
    const conflicts = this.outbox.conflicts().length;
    if (conflicts > 0) return `확인 필요 ${conflicts}`;
    if (!this.network.online()) return waiting > 0 ? `오프라인 · 대기 ${waiting}` : '오프라인';
    if (waiting > 0) return `보내는 중 ${waiting}`;
    return '동기화됨';
  });
}
