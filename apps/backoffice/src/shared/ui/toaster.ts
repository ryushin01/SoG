import { ChangeDetectionStrategy, Component, inject, Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  tone: 'info' | 'success' | 'error';
  message: string;
}

/** 짧은 알림. 6초 뒤 사라지지만, 포인터나 초점이 올라가 있는 동안은 멈춥니다. */
@Injectable({ providedIn: 'root' })
export class Toaster {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(message: string, tone: Toast['tone'] = 'info'): void {
    const id = this.seq++;
    this.toasts.update((list) => [...list.slice(-3), { id, tone, message }]);
    this.schedule(id);
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }

  pause(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  resume(): void {
    this.toasts().forEach((toast) => this.schedule(toast.id));
  }

  private schedule(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), 6000),
    );
  }
}

@Component({
  selector: 'sog-toast-outlet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="toasts"
      role="status"
      aria-live="polite"
      (mouseenter)="toaster.pause()"
      (mouseleave)="toaster.resume()"
      (focusin)="toaster.pause()"
      (focusout)="toaster.resume()"
    >
      @for (toast of toaster.toasts(); track toast.id) {
        <div class="toast" [class]="'toast toast--' + toast.tone">
          <p>{{ toast.message }}</p>
          <button
            type="button"
            class="btn btn--quiet btn--small"
            (click)="toaster.dismiss(toast.id)"
          >
            닫기<span class="visually-hidden">: {{ toast.message }}</span>
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed;
      inset-block-end: 1rem;
      inset-inline-end: 1rem;
      z-index: 50;
      display: grid;
      gap: 0.5rem;
      width: min(24rem, calc(100vw - 2rem));
    }
    .toast {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 0.75rem 0.75rem 1rem;
      border: 1px solid var(--ink);
      border-inline-start-width: 4px;
      background: var(--surface-raised);
      font-size: 0.875rem;
      box-shadow: 0 8px 24px rgb(38 41 51 / 0.12);
    }
    .toast--success {
      border-inline-start-color: var(--ok);
    }
    .toast--error {
      border-inline-start-color: var(--accent);
    }
    .toast--info {
      border-inline-start-color: var(--ink);
    }
    .toast p {
      padding-block: 0.25rem;
    }
  `,
})
export class ToastOutlet {
  protected readonly toaster = inject(Toaster);
}
