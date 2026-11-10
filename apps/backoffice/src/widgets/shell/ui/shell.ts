import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { ToastOutlet } from '@/shared/ui';
import { RemoteChangeNotifier } from '@/features/notify-changes';
import { ResetDemoButton } from '@/features/reset-demo';
import { UserSwitcher } from '@/features/switch-user';

const NAV = [
  { index: '00', path: '/', label: '운영 현황', exact: true },
  { index: '01', path: '/inventory', label: '재고', exact: false },
  { index: '02', path: '/counts', label: '재고 실사', exact: false },
  { index: '03', path: '/map', label: '창고 도면', exact: false },
  { index: '04', path: '/activity', label: '활동 기록', exact: false },
];

/** 화면 틀: 본문 바로가기, 번호 붙은 주 메뉴, 사용자 전환, 실시간 표시, 알림 */
@Component({
  selector: 'sog-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    ToastOutlet,
    RemoteChangeNotifier,
    ResetDemoButton,
    UserSwitcher,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  protected readonly nav = NAV;
  protected readonly menuOpen = signal(false);
  private readonly document = inject(DOCUMENT);

  constructor() {
    let first = true;
    const subscription = inject(Router)
      .events.pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.menuOpen.set(false);
        // 처음 열 때를 빼고, 화면이 바뀌면 새 화면의 제목으로 초점을 옮겨 스크린 리더가 바뀐 화면을 읽게 합니다.
        if (first) {
          first = false;
          return;
        }
        setTimeout(() =>
          this.document.getElementById('page-title')?.focus({ preventScroll: true }),
        );
      });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  protected skipToMain(event: Event): void {
    event.preventDefault();
    const main = this.document.getElementById('main');
    main?.focus();
    main?.scrollIntoView();
  }
}
