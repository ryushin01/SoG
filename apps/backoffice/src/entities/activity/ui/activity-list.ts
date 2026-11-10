import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Activity } from '@sog/domain';
import { AgoPipe, DateTimePipe } from '@/shared/lib';

@Component({
  selector: 'sog-activity-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AgoPipe, DateTimePipe],
  template: `
    <ol class="feed">
      @for (item of items(); track item.id) {
        <li class="feed__item" [class.feed__item--conflict]="item.kind === 'conflict'">
          <time class="feed__time" [attr.datetime]="item.at" [title]="item.at | dateTime">{{
            item.at | ago
          }}</time>
          @if (item.target) {
            <a class="feed__msg" [routerLink]="item.target">{{ item.message }}</a>
          } @else {
            <p class="feed__msg">{{ item.message }}</p>
          }
        </li>
      } @empty {
        <li class="feed__empty">아직 기록이 없습니다.</li>
      }
    </ol>
  `,
  styles: `
    .feed {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .feed__item {
      display: grid;
      grid-template-columns: 5.5rem 1fr;
      gap: 0.75rem;
      padding: 0.625rem 0;
      border-bottom: 1px solid var(--line);
      font-size: 0.875rem;
    }
    .feed__item--conflict .feed__msg {
      color: var(--accent);
    }
    .feed__time {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--ink-soft);
      padding-top: 0.125rem;
    }
    .feed__msg {
      text-decoration: none;
    }
    a.feed__msg:hover {
      text-decoration: underline;
    }
    .feed__empty {
      padding: 1rem 0;
      color: var(--ink-soft);
    }
  `,
})
export class ActivityList {
  readonly items = input.required<Activity[]>();
}
