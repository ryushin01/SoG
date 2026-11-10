import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { WmsHost } from '@/shared/api';
import { Toaster } from '@/shared/ui';

/**
 * 다른 탭(다른 사용자, 실사 앱)의 변경을 알림으로 보여 주고, 실시간 표시등을 깜빡입니다.
 * 같은 탭에서 한 변경은 각 화면이 직접 안내하므로 건너뜁니다.
 */
@Component({
  selector: 'sog-remote-change-notifier',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="live" [class.live--pulse]="pulse()">
      <span class="live__dot" aria-hidden="true"></span>
      실시간 동기화
      <span class="visually-hidden">: 다른 탭의 변경을 바로 반영합니다.</span>
    </p>
  `,
  styles: `
    .live {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ink-soft);
    }
    .live__dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: var(--ok);
      box-shadow: 0 0 0 0 rgb(47 107 79 / 0.5);
    }
    .live--pulse .live__dot {
      background: var(--accent);
      animation: ping 1s var(--ease);
    }
    @keyframes ping {
      to {
        box-shadow: 0 0 0 10px rgb(145 26 70 / 0);
      }
    }
  `,
})
export class RemoteChangeNotifier {
  private readonly host = inject(WmsHost);
  private readonly toaster = inject(Toaster);
  protected readonly pulse = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.host.onChange(['*', 'skus', 'counts', 'dashboard'], (event) => {
      if (this.host.isOwn(event) || !event.message) return;
      this.toaster.show(event.message, 'info');
      this.pulse.set(true);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.pulse.set(false), 1200);
    });
  }
}
