import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthSession } from '@/shared/api';
import { Shell } from '@/widgets/shell';

@Component({
  selector: 'sog-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Shell],
  template: `<sog-shell><router-outlet /></sog-shell>`,
})
export class App {
  constructor() {
    const auth = inject(AuthSession);
    const router = inject(Router);
    // 로그아웃되거나 토큰이 만료되면(401) 로그인 화면으로 보냅니다.
    effect(() => {
      if (auth.signedIn()) return;
      // 첫 화면은 가드가 돌아올 주소를 붙여 보냅니다. 첫 이동이 끝나기 전에 끼어들면 그 주소를 덮어씁니다.
      if (!router.navigated) return;
      const url = router.url;
      if (!url.startsWith('/login')) {
        void router.navigate(['/login'], {
          queryParams: url && url !== '/' ? { returnUrl: url } : {},
        });
      }
    });
  }
}
