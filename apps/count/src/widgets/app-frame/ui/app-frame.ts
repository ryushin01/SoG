import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';
import { OperatorSession } from '@/entities/operator';
import { SyncStatus } from '@/features/sync-outbox';
import { UnsavedWork } from '@/shared/lib';

/** 현장 앱 틀: 본문 바로가기, 위쪽 상태 막대, 엄지로 닿는 아래쪽 탭 */
@Component({
  selector: 'cnt-app-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SyncStatus],
  template: `
    <a class="skip" href="#main" (click)="skip($event)">본문 바로가기</a>
    <header class="top">
      <a class="brand" routerLink="/">
        <span class="brand__mark">SoG</span>
        <span class="caption">재고 실사</span>
      </a>
      <div class="top__right">
        @if (session.operator(); as op) {
          <span class="who">{{ op.name }}</span>
        }
        <cnt-sync-status />
      </div>
    </header>
    @if (updateReady()) {
      <div class="update" role="status">
        <p>
          새 버전이 준비되었습니다. 저장한 실사 기록은 그대로 남습니다.
          @if (unsaved.dirty()) {
            입력 중인 수량은 먼저 저장해 주세요.
          }
        </p>
        <button type="button" class="btn btn--solid" (click)="reload()">새로 고침</button>
      </div>
    }
    <main id="main" tabindex="-1">
      <ng-content />
    </main>
    @if (session.operator()) {
      <nav class="tabs" aria-label="주 메뉴">
        <a
          class="tab"
          routerLink="/"
          [class.tab--on]="section() === 'tasks'"
          [attr.aria-current]="section() === 'tasks' ? 'page' : null"
          >실사 작업</a
        >
        <a
          class="tab"
          routerLink="/settings"
          [class.tab--on]="section() === 'settings'"
          [attr.aria-current]="section() === 'settings' ? 'page' : null"
          >보낼함·설정</a
        >
      </nav>
    }
  `,
  styles: `
    .skip {
      position: absolute;
      inset-inline-start: 0.5rem;
      inset-block-start: -4rem;
      z-index: 100;
      padding: 0.75rem 1rem;
      background: var(--ink);
      color: var(--paper);
    }
    .skip:focus {
      inset-block-start: 0.5rem;
    }
    .top {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      min-height: var(--bar);
      padding: 0.375rem var(--gutter);
      border-bottom: 1px solid var(--line);
      background: rgb(254 253 252 / 0.92);
      backdrop-filter: blur(8px);
    }
    .brand {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      text-decoration: none;
    }
    .brand__mark {
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: -0.05em;
    }
    .top__right {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .who {
      font-size: 0.875rem;
      font-weight: 600;
    }
    .update {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem var(--gutter);
      background: var(--sky);
      font-size: 0.875rem;
    }
    main:focus {
      outline: none;
    }
    .tabs {
      position: fixed;
      inset-inline: 0;
      bottom: 0;
      z-index: 10;
      display: grid;
      grid-template-columns: 1fr 1fr;
      padding-bottom: env(safe-area-inset-bottom);
      border-top: 1px solid var(--ink);
      background: var(--paper);
    }
    .tab {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 3.5rem;
      font-family: var(--font-mono);
      font-size: 0.8125rem;
      letter-spacing: -0.02em;
      text-transform: uppercase;
      text-decoration: none;
    }
    .tab + .tab {
      border-inline-start: 1px solid var(--line);
    }
    .tab--on {
      background: var(--sky);
      font-weight: 600;
    }
  `,
})
export class AppFrame {
  protected readonly session = inject(OperatorSession);
  private readonly document = inject(DOCUMENT);
  /** 아래쪽 탭의 현재 구역. 작업 목록·작업·품목 화면은 모두 실사 작업 탭입니다. */
  protected readonly section = signal<'tasks' | 'settings' | null>(null);
  /** 서비스 워커가 새 버전을 받아 두었는지 */
  protected readonly updateReady = signal(false);
  private readonly updates = inject(SwUpdate);
  protected readonly unsaved = inject(UnsavedWork);

  constructor() {
    let first = true;
    const subscription = inject(Router)
      .events.pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        const url = event.urlAfterRedirects;
        this.section.set(
          url.startsWith('/settings') ? 'settings' : url.startsWith('/start') ? null : 'tasks',
        );
        if (first) {
          first = false;
          return;
        }
        // 화면이 바뀌면 새 화면의 제목으로 초점을 옮깁니다.
        setTimeout(() =>
          this.document.getElementById('page-title')?.focus({ preventScroll: false }),
        );
      });
    const updates = this.updates.isEnabled
      ? this.updates.versionUpdates
          .pipe(filter((event) => event.type === 'VERSION_READY'))
          .subscribe(() => this.updateReady.set(true))
      : null;
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      updates?.unsubscribe();
    });
  }

  protected skip(event: Event): void {
    event.preventDefault();
    this.document.getElementById('main')?.focus();
  }

  /** 새 버전으로 바꾸고 다시 엽니다. 보낼함은 IndexedDB에 있어 사라지지 않습니다. */
  protected reload(): void {
    // 수량을 입력하고 아직 저장하지 않았으면 먼저 확인합니다. 저장한 기록은 보낼함에 남아 안전합니다.
    if (
      this.unsaved.dirty() &&
      !this.document.defaultView?.confirm(
        '저장하지 않은 수량이 있습니다. 새로 고치면 지워집니다. 계속할까요?',
      )
    ) {
      return;
    }
    // VERSION_READY 뒤에는 다시 열기만 해도 새 버전이 적용됩니다. 기다리는 틈에 입력이 생기지 않게 바로 엽니다.
    this.document.location.reload();
  }
}
