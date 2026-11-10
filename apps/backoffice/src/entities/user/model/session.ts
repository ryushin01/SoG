import { httpResource } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { Reference, User } from '@sog/domain';
import { ApiIdentity } from '@/shared/api';

const STORAGE_KEY = 'sog:backoffice:user';

function readStored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * 이 탭의 사용자. sessionStorage에 두어 탭마다 다른 사용자로 로그인한 것처럼 동작합니다.
 * 탭 두 개를 열고 각각 다른 관리자로 바꾸면 동시 수정 충돌을 직접 만들어 볼 수 있습니다.
 */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly identity = inject(ApiIdentity);
  private readonly reference = httpResource<Reference>(() => '/api/reference');

  readonly users = computed<User[]>(
    () => (this.reference.hasValue() ? this.reference.value() : undefined)?.users ?? [],
  );
  readonly managers = computed(() => this.users().filter((user) => user.role === 'manager'));
  readonly operators = computed(() => this.users().filter((user) => user.role === 'operator'));
  readonly userId = signal(readStored() ?? 'u-kim');
  readonly user = computed(() => this.users().find((user) => user.id === this.userId()) ?? null);

  constructor() {
    effect(() => {
      const id = this.userId();
      this.identity.userId.set(id);
      try {
        sessionStorage.setItem(STORAGE_KEY, id);
      } catch {
        // 저장할 수 없는 환경(사생활 보호 모드 등)에서는 탭을 닫으면 기본 사용자로 돌아갑니다.
      }
    });
  }

  nameOf(id: string | null | undefined): string {
    if (!id) return '—';
    return this.users().find((user) => user.id === id)?.name ?? id;
  }
}
