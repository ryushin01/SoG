import { InjectionToken } from '@angular/core';

/** 기기 저장소(보낼함, 오프라인 사본) DB 이름. 테스트마다 다른 이름을 줘 서로 섞이지 않게 합니다. */
export const LOCAL_DB_NAME = new InjectionToken<string>('LOCAL_DB_NAME', {
  factory: () => 'sog-count',
});
