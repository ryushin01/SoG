import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthSession } from '@/shared/api';
import { AppFrame } from '@/widgets/app-frame';

@Component({
  selector: 'cnt-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, AppFrame],
  template: `<cnt-app-frame><router-outlet /></cnt-app-frame>`,
})
export class App {
  constructor() {
    const auth = inject(AuthSession);
    const router = inject(Router);
    // 로그아웃되거나 토큰이 만료되면(401) 로그인 화면으로 보냅니다. 보낼함의 기록은 기기에 그대로 남습니다.
    effect(() => {
      // 첫 화면은 가드가 맡습니다.
      if (!auth.signedIn() && router.navigated && !router.url.startsWith('/start'))
        void router.navigateByUrl('/start');
    });
  }
}
