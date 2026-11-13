import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthSession } from '@/shared/api';

/** 작업자로 로그인하지 않았으면 로그인 화면으로 보냅니다. */
export const operatorGuard: CanActivateFn = () => {
  const auth = inject(AuthSession);
  if (auth.user()?.role === 'operator') return true;
  if (auth.user()) auth.logout('현장 앱은 작업자 계정으로 로그인합니다.');
  return inject(Router).createUrlTree(['/start']);
};
