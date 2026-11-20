import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { check, loginResponseSchema, type LoginResponse, type User } from '@sog/domain';
import { firstValueFrom } from 'rxjs';
import { readStored } from './stored';

/**
 * 토큰을 둘 곳.
 * - session(백오피스): 탭마다 따로. 탭 두 개를 서로 다른 관리자로 열어 동시 수정을 시연할 수 있습니다.
 * - local(현장 앱): 기기에 남겨, 앱을 닫았다 열거나 오프라인일 때도 로그인이 유지됩니다.
 * 쿠키는 모든 탭이 함께 써서 탭별 계정이 불가능하므로 Authorization 헤더로 보냅니다.
 */
export const AUTH_STORAGE = new InjectionToken<'session' | 'local'>('AUTH_STORAGE', {
  factory: () => 'session',
});

const KEY = 'sog:auth';

interface Stored {
  token: string;
  expiresAt: number;
  user: User;
}

function storageOf(kind: 'session' | 'local'): Storage | null {
  try {
    return kind === 'session' ? sessionStorage : localStorage;
  } catch {
    return null;
  }
}

/** 기기에 남은 로그인. 깨졌거나 옛 형식이면(스키마) 없는 것으로, 만료됐으면 로그아웃 상태로 봅니다. */
function read(kind: 'session' | 'local'): Stored | null {
  const value = readStored(() => storageOf(kind), KEY, loginResponseSchema());
  return value && value.expiresAt * 1000 > Date.now() ? value : null;
}

/** 로그인 상태. 인터셉터가 토큰을 Authorization 헤더로 붙입니다. */
@Injectable({ providedIn: 'root' })
export class AuthSession {
  private readonly http = inject(HttpClient);
  private readonly kind = inject(AUTH_STORAGE);
  private readonly state = signal<Stored | null>(read(this.kind));

  readonly user = computed(() => this.state()?.user ?? null);
  readonly token = computed(() => this.state()?.token ?? null);
  readonly signedIn = computed(() => this.state() !== null);
  /** 서버가 401로 끊었을 때 보여 줄 안내 */
  readonly notice = signal<string | null>(null);

  async login(userId: string, password: string): Promise<User> {
    const raw = await firstValueFrom(
      this.http.post<LoginResponse>('/api/auth/login', { userId, password }),
    );
    // 응답 모양이 다르면(배포가 엇갈린 서버 등) 기기에 남기지 않고 실패로 알립니다.
    const checked = check(loginResponseSchema(), raw);
    if (!checked.ok)
      throw new Error('로그인 응답을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    const response = checked.value;
    this.save({ token: response.token, expiresAt: response.expiresAt, user: response.user });
    this.notice.set(null);
    return response.user;
  }

  logout(notice: string | null = null): void {
    try {
      storageOf(this.kind)?.removeItem(KEY);
    } catch {
      // 저장소를 쓸 수 없어도 화면 상태는 비웁니다.
    }
    this.state.set(null);
    this.notice.set(notice);
  }

  private save(value: Stored): void {
    try {
      storageOf(this.kind)?.setItem(KEY, JSON.stringify(value));
    } catch {
      // 저장하지 못하면 이번 화면 동안만 로그인됩니다.
    }
    this.state.set(value);
  }
}

/**
 * 테스트·스토리용: 데모 모드 서명 키로 만든 토큰을 저장소에 미리 넣어 로그인된 상태로 시작합니다.
 * 운영 서버는 다른 키(AUTH_SECRET)를 쓰므로 이 토큰은 운영에서 통하지 않습니다.
 */
export async function seedTestSession(
  user: User,
  kind: 'session' | 'local' = 'session',
): Promise<void> {
  // 데모 서버 패키지는 앱 첫 화면 묶음에 넣지 않도록 필요할 때 가져옵니다.
  const { issueToken, LOCAL_AUTH_SECRET } = await import('@sog/wms-server');
  const { token, expiresAt } = await issueToken(
    LOCAL_AUTH_SECRET,
    user.id,
    Math.floor(Date.now() / 1000),
  );
  storageOf(kind)?.setItem(KEY, JSON.stringify({ token, expiresAt, user } satisfies Stored));
}
