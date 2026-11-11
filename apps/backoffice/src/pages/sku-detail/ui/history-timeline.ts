import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { formatNumber, type HistoryChange, type HistoryEntry } from '@sog/domain';
import { AgoPipe, DateTimePipe } from '@/shared/lib';
import { UserNamePipe } from '@/entities/user';

/**
 * 품목의 변경 이력. 누가 언제 무엇을 바꿨는지, 버전 충돌로 막힌 시도는 무엇이었는지 보여 줍니다.
 * 품목 정보 기록은 그때의 값을 수정 폼에 불러올 수 있습니다.
 */
@Component({
  selector: 'sog-history-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AgoPipe, DateTimePipe, UserNamePipe],
  template: `
    <ol class="timeline">
      @for (entry of items(); track entry.id) {
        <li class="entry" [class.entry--blocked]="entry.blocked">
          <div class="entry__head">
            <time class="mono muted" [attr.datetime]="entry.at" [title]="entry.at | dateTime">{{
              entry.at | ago
            }}</time>
            <strong>{{ entry.by | userName }}</strong>
            @if (entry.blocked) {
              <span class="badge badge--danger">막힘 · 버전 충돌</span>
            } @else {
              <span class="mono muted">v{{ entry.version }}</span>
            }
            <span class="muted">{{ kindLabel(entry) }}</span>
          </div>
          <ul class="changes">
            @for (change of entry.changes; track change.field) {
              <li>
                <span class="changes__label">{{ change.label }}</span>
                <span class="mono">{{ show(change, change.before) }}</span>
                <span aria-hidden="true">→</span><span class="visually-hidden">에서</span>
                <span class="mono changes__after">{{ show(change, change.after) }}</span>
                @if (entry.blocked) {
                  <span class="visually-hidden">(저장되지 않음)</span>
                }
              </li>
            }
          </ul>
          @if (entry.reason) {
            <p class="entry__reason muted">{{ entry.reason }}</p>
          }
          @if (entry.kind === 'sku' && editable()) {
            <button
              type="button"
              class="btn btn--small"
              [attr.aria-label]="
                (entry.blocked ? '이 값으로 다시: ' : '이전 값으로: ') + labels(entry)
              "
              (click)="restore.emit(entry)"
            >
              {{ entry.blocked ? '이 값으로 다시' : '이전 값으로' }}
            </button>
          }
        </li>
      } @empty {
        <li class="muted empty">
          아직 변경 이력이 없습니다. 정보를 고치거나 재고를 조정하면 여기에 남습니다.
        </li>
      }
    </ol>
  `,
  styles: `
    .timeline {
      margin: 0;
      padding: 0;
      list-style: none;
      border-inline-start: 2px solid var(--line-strong);
    }
    .entry {
      position: relative;
      display: grid;
      justify-items: start;
      gap: 0.375rem;
      padding: 0.75rem 0 1rem 1.25rem;
      font-size: 0.875rem;
    }
    .entry::before {
      content: '';
      position: absolute;
      inset-inline-start: -0.4375rem;
      top: 1rem;
      width: 0.75rem;
      height: 0.75rem;
      border-radius: 50%;
      background: var(--ink);
    }
    .entry--blocked::before {
      background: var(--accent);
    }
    .entry__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }
    .changes {
      display: grid;
      gap: 0.125rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .changes li {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
    }
    .changes__label {
      min-width: 4.5rem;
      font-weight: 600;
    }
    .entry--blocked .changes__after {
      text-decoration: line-through;
      color: var(--accent);
    }
    .entry__reason {
      font-size: 0.8125rem;
    }
    .empty {
      padding: 1rem 1.25rem;
    }
  `,
})
export class HistoryTimeline {
  readonly items = input.required<HistoryEntry[]>();
  readonly editable = input(true);
  readonly restore = output<HistoryEntry>();

  protected kindLabel(entry: HistoryEntry): string {
    if (entry.kind === 'sku') return '품목 정보';
    if (entry.kind === 'stock') return `재고 ${entry.locationCode ?? ''}`;
    return `실사 ${entry.locationCode ?? ''}`;
  }

  protected show(change: HistoryChange, value: string | number | null): string {
    if (value === null || value === '') return '(비어 있음)';
    if (change.field === 'unitCost' && typeof value === 'number') return `${formatNumber(value)}원`;
    if (typeof value === 'number') return formatNumber(value);
    if (change.field === 'status')
      return (
        ({ pending: '미실사', counted: '완료', recount: '재실사 요청' } as Record<string, string>)[
          value
        ] ?? value
      );
    return value.length > 40 ? `${value.slice(0, 40)}…` : value;
  }

  protected labels(entry: HistoryEntry): string {
    return entry.changes.map((c) => c.label).join(', ');
  }
}
