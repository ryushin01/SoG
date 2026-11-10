import { Injectable, signal } from '@angular/core';

/** 저장하지 않은 입력이 있는지. 새 버전으로 새로 고칠 때 입력을 잃지 않도록 확인을 받는 데 씁니다. */
@Injectable({ providedIn: 'root' })
export class UnsavedWork {
  readonly dirty = signal(false);
}
