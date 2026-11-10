import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Presence } from '@/shared/api';
import { OperatorSession } from '@/entities/operator';

/**
 * 같은 작업·품목을 지금 보고 있는 다른 사람. 두 작업자가 같은 품목을 동시에 세지 않도록 미리 알려 줍니다.
 */
@Component({
  selector: 'cnt-peer-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="peers" role="status">
      @if (people().length > 0) {
        <ul>
          @for (peer of people(); track peer.tabId) {
            <li [class.same]="peer.same">
              <span class="dot" aria-hidden="true"></span>
              <strong>{{ peer.name }}</strong
              >님이
              {{
                peer.same
                  ? '이 품목을 보고 있습니다'
                  : peer.detail
                    ? peer.detail + ' 앞에 있습니다'
                    : '이 작업을 보고 있습니다'
              }}
              <span class="muted">({{ peer.app }})</span>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .peers:empty {
      display: none;
    }
    ul {
      display: grid;
      gap: 0.25rem;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 0.875rem;
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem;
      padding: 0.5rem 0.75rem;
      background: var(--stone);
    }
    li.same {
      background: var(--warn-soft);
      color: var(--warn);
    }
    .dot {
      width: 0.5rem;
      height: 0.5rem;
      margin-inline-end: 0.25rem;
      border-radius: 50%;
      background: currentColor;
    }
  `,
})
export class PeerNotice {
  /** 작업 단위 자원. 예: counts/ct-003 */
  readonly resource = input.required<string>();
  /** 지금 보고 있는 품목 자원. 같은 품목을 보는 사람을 강조합니다. */
  readonly current = input<string | null>(null);
  private readonly session = inject(OperatorSession);
  private readonly peers = inject(Presence).peers(() => this.resource());

  protected readonly people = computed(() =>
    this.peers().map((peer) => ({
      ...peer,
      name: this.session.nameOf(peer.userId),
      same: this.current() !== null && peer.resource === this.current(),
    })),
  );
}
