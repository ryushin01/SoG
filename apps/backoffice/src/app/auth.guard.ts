import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthSession } from '@/shared/api';

/** 관리자로 로그인하지 않았으면 로그인 화면으로 보냅니다. 돌아올 주소를 남깁니다. */
export const managerGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthSession);
  if (auth.user()?.role === 'manager') return true;
  if (auth.user()) auth.logout('백오피스는 관리자 계정으로 로그인합니다.');
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
