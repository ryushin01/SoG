import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { Reference, User } from '@sog/domain';
import { ApiIdentity } from '@/shared/api';

const OPERATOR_KEY = 'sog:count:operator';
const USERS_KEY = 'sog:count:users';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 저장할 수 없으면 이번 실행 동안만 기억합니다.
  }
}

/** 이 기기를 쓰는 작업자. 기기에 남겨 두어 앱을 다시 열어도 유지합니다. */
@Injectable({ providedIn: 'root' })
export class OperatorSession {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(ApiIdentity);

  readonly users = signal<User[]>(JSON.parse(read(USERS_KEY) ?? '[]') as User[]);
  readonly operators = computed(() => this.users().filter((user) => user.role === 'operator'));
  readonly operatorId = signal<string | null>(read(OPERATOR_KEY));
  readonly operator = computed(
    () => this.users().find((user) => user.id === this.operatorId()) ?? null,
  );

  constructor() {
    effect(() => {
      const id = this.operatorId();
      if (id) this.identity.userId.set(id);
      write(OPERATOR_KEY, id);
    });
    this.http.get<Reference>('/api/reference').subscribe({
      next: (reference) => {
        this.users.set(reference.users);
        write(USERS_KEY, JSON.stringify(reference.users));
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
    this.operatorId.set(null);
  }
}
