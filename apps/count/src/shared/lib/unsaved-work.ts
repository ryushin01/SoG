import { computed, Injectable, signal } from '@angular/core';

/**
 * 저장하지 않은 입력이 있는지. 새 버전으로 새로 고칠 때 입력을 잃지 않도록 확인을 받는 데 씁니다.
 * 표시를 켠 폼만 끌 수 있어서, 늦게 끝난 이전 폼의 저장이 새 폼의 표시를 지우지 않습니다.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedWork {
  private readonly owner = signal<object | null>(null);
  readonly dirty = computed(() => this.owner() !== null);

  mark(owner: object, dirty: boolean): void {
    if (dirty) this.owner.set(owner);
    else if (this.owner() === owner) this.owner.set(null);
  }
}
