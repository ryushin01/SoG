import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { OperatorSession } from '@/entities/operator';

/** 작업자를 고르지 않았으면 시작 화면으로 보냅니다. */
export const operatorGuard: CanActivateFn = () => {
  const session = inject(OperatorSession);
  return session.operatorId() ? true : inject(Router).createUrlTree(['/start']);
};
