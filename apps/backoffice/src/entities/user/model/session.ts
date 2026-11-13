import { httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type { Reference, User } from '@sog/domain';
import { AuthSession } from '@/shared/api';

/**
 * 이 탭의 로그인 사용자와 사용자 목록. 토큰은 탭마다 따로 두어(sessionStorage),
 * 탭 두 개를 서로 다른 관리자로 로그인해 동시 수정 충돌을 직접 만들어 볼 수 있습니다.
 */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly auth = inject(AuthSession);
  private readonly reference = httpResource<Reference>(() => '/api/reference');

  readonly users = computed<User[]>(
    () => (this.reference.hasValue() ? this.reference.value() : undefined)?.users ?? [],
  );
  readonly managers = computed(() => this.users().filter((user) => user.role === 'manager'));
  readonly operators = computed(() => this.users().filter((user) => user.role === 'operator'));
  readonly user = this.auth.user;
  readonly userId = computed(() => this.auth.user()?.id ?? null);

  nameOf(id: string | null | undefined): string {
    if (!id) return '—';
    return this.users().find((user) => user.id === id)?.name ?? id;
  }
}
