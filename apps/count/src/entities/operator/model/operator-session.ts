import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { Reference, User } from '@sog/domain';
import { AuthSession, Presence } from '@/shared/api';

const USERS_KEY = 'sog:count:users';

function readUsers(): User[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') as User[];
  } catch {
    return [];
  }
}

/**
 * 이 기기를 쓰는 작업자. 로그인 토큰을 기기에 남겨(localStorage) 앱을 다시 열거나
 * 창고 음영 지역에서도 로그인이 유지됩니다. 사용자 목록도 기기에 남겨 오프라인에서 이름을 보여 줍니다.
 */
@Injectable({ providedIn: 'root' })
export class OperatorSession {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthSession);
  private readonly presence = inject(Presence);

  readonly users = signal<User[]>(readUsers());
  readonly operators = computed(() => this.users().filter((user) => user.role === 'operator'));
  readonly operator = computed(() => {
    const user = this.auth.user();
    return user?.role === 'operator' ? user : null;
  });
  readonly operatorId = computed(() => this.operator()?.id ?? null);

  constructor() {
    this.http.get<Reference>('/api/reference').subscribe({
      next: (reference) => {
        this.users.set(reference.users);
        try {
          localStorage.setItem(USERS_KEY, JSON.stringify(reference.users));
        } catch {
          // 저장하지 못하면 다음 연결 때 다시 받습니다.
        }
      },
      // 오프라인이면 기기에 남은 목록을 씁니다.
      error: () => undefined,
    });
  }

  nameOf(id: string | null | undefined): string {
    if (!id) return '—';
    return this.users().find((user) => user.id === id)?.name ?? id;
  }

  signOut(): void {
    this.presence.leave();
    this.auth.logout();
  }
}
