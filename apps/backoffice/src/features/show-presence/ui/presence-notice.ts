import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Presence } from '@/shared/api';
import { Session } from '@/entities/user';

/**
 * 같은 품목·실사 작업을 지금 보고 있는 다른 사람. 수정 중인 사람을 먼저 보여 줘 충돌을 미리 피하게 합니다.
 * 현장 앱 작업자는 세고 있는 품목까지 보입니다.
 */
@Component({
  selector: 'sog-presence-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="presence" role="status">
      @if (people().length > 0) {
        <span class="presence__label">지금 함께 보는 사람</span>
        <ul class="presence__list">
          @for (peer of people(); track peer.tabId) {
            <li class="peer" [class.peer--editing]="peer.editing">
              <span class="peer__avatar" aria-hidden="true">{{ peer.initial }}</span>
              <span>
                <strong>{{ peer.name }}</strong>
                <span class="muted"> · {{ peer.app }}</span>
                @if (peer.editing) {
                  <span class="peer__tag">수정 중</span>
                }
                @if (peer.detail) {
                  <span class="peer__detail">{{ peer.detail }}</span>
                }
              </span>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .presence:empty {
      display: none;
    }
    .presence {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 1rem;
      margin-block-end: 1.25rem;
      font-size: 0.8125rem;
    }
    .presence__label {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ink-soft);
    }
    .presence__list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .peer {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 0.75rem 0.25rem 0.25rem;
      border: 1px solid var(--line-strong);
      border-radius: 999px;
      background: var(--surface);
    }
    .peer--editing {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
    .peer__avatar {
      display: grid;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 50%;
      background: var(--ink);
      color: var(--surface);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .peer__tag {
      margin-inline-start: 0.375rem;
      font-weight: 700;
      color: var(--accent);
    }
    .peer__detail {
      display: block;
      color: var(--ink-soft);
    }
  `,
})
export class PresenceNotice {
  readonly resource = input.required<string>();
  private readonly session = inject(Session);
  private readonly peers = inject(Presence).peers(() => this.resource());

  protected readonly people = computed(() =>
    this.peers().map((peer) => {
      const name = this.session.nameOf(peer.userId);
      return { ...peer, name, initial: name.slice(0, 1) };
    }),
  );
}
