import { computed, Injectable, signal } from '@angular/core';

/**
 * 저장하지 않은 입력이 있는지. 새 버전으로 새로 고칠 때 입력을 잃지 않도록 확인을 받는 데 씁니다.
 * - 수정 중인 입력: 표시를 켠 폼만 끌 수 있어서, 늦게 끝난 이전 폼의 저장이 새 폼의 표시를 지우지 않습니다.
 * - 진행 중인 저장: 폼이 사라져도 기기에 다 쓸 때까지 보호합니다.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedWork {
  private readonly owner = signal<object | null>(null);
  private readonly saving = signal(0);
  readonly dirty = computed(() => this.owner() !== null || this.saving() > 0);

  mark(owner: object, dirty: boolean): void {
    if (dirty) this.owner.set(owner);
    else if (this.owner() === owner) this.owner.set(null);
  }

  /** 기기에 쓰는 동안 보호합니다. 끝나면 반드시 돌려준 함수를 부릅니다. */
  beginSave(): () => void {
    this.saving.update((n) => n + 1);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.saving.update((n) => Math.max(0, n - 1));
    };
  }
}
