import { Pipe, type PipeTransform } from '@angular/core';
import { formatDelta, formatNumber, formatWon } from '@sog/domain';

const dateTime = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const date = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});
const relative = new Intl.RelativeTimeFormat('ko-KR', { numeric: 'auto' });

function relativeTime(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return '방금';
  if (abs < 3600) return relative.format(Math.round(diff / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(diff / 3600), 'hour');
  if (abs < 86_400 * 30) return relative.format(Math.round(diff / 86_400), 'day');
  return date.format(new Date(iso));
}

@Pipe({ name: 'num' })
export class NumPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : formatNumber(value);
  }
}

@Pipe({ name: 'won' })
export class WonPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : formatWon(value);
  }
}

@Pipe({ name: 'delta' })
export class DeltaPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : formatDelta(value);
  }
}

@Pipe({ name: 'dateTime' })
export class DateTimePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? dateTime.format(new Date(value)) : '—';
  }
}

@Pipe({ name: 'date' })
export class DatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? date.format(new Date(value)) : '—';
  }
}

@Pipe({ name: 'ago' })
export class AgoPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? relativeTime(value) : '—';
  }
}
