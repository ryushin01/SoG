import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

/**
 * 네트워크 상태. 데모 서버는 브라우저 안에 있어 실제로는 끊기지 않으므로,
 * 현장 앱의 오프라인 동작을 보여 주려고 "오프라인 모의" 스위치를 함께 둡니다.
 */
@Injectable({ providedIn: 'root' })
export class NetworkState {
  private readonly browserOnline = signal(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  readonly simulatedOffline = signal(false);
  readonly online = computed(() => this.browserOnline() && !this.simulatedOffline());

  constructor() {
    if (typeof window === 'undefined') return;
    const update = () => this.browserOnline.set(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    });
  }
}
