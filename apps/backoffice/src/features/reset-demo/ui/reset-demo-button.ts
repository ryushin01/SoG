import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SubmitLock, toApiError, WmsHost } from '@/shared/api';
import { Dialog, Toaster } from '@/shared/ui';

/** 데모 데이터를 처음 상태로 되돌립니다. 같은 브라우저의 실사 앱 데이터도 함께 바뀝니다. */
@Component({
  selector: 'sog-reset-demo-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialog],
  template: `
    <button type="button" class="btn btn--quiet btn--small" (click)="open.set(true)">
      데모 초기화
    </button>
    <sog-dialog [(open)]="open" heading="데모 데이터 초기화">
      <div class="stack">
        <p>
          @if (host.mode() === 'remote') {
            재고, 입출고, 실사 작업, 출고 지시, 활동 기록을 처음 상태로 되돌립니다. 서버의
            데이터라서 지금 이 사이트를 쓰는 모든 사람에게 적용됩니다.
          } @else {
            재고, 입출고, 실사 작업, 출고 지시, 활동 기록을 처음 상태로 되돌립니다. 이 브라우저에서
            연 실사 앱에도 적용됩니다.
          }
        </p>
        <div class="cluster">
          <button
            type="button"
            class="btn btn--danger"
            [disabled]="lock.pending()"
            (click)="reset()"
          >
            {{ lock.pending() ? '초기화 중…' : '초기화' }}
          </button>
          <button type="button" class="btn" (click)="open.set(false)">취소</button>
        </div>
      </div>
    </sog-dialog>
  `,
})
export class ResetDemoButton {
  private readonly http = inject(HttpClient);
  private readonly toaster = inject(Toaster);
  protected readonly open = signal(false);
  protected readonly host = inject(WmsHost);
  protected readonly lock = new SubmitLock();

  protected reset(): void {
    void this.lock.run(async () => {
      try {
        await firstValueFrom(this.http.post('/api/_reset', null));
        this.open.set(false);
        this.toaster.show('데모 데이터를 초기화했습니다.', 'success');
      } catch (error) {
        this.toaster.show(toApiError(error).message, 'error');
      }
    });
  }
}
