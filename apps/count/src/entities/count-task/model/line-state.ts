import type { CountLineView } from '@sog/domain';

export type LineState = 'pending' | 'counted' | 'recount' | 'queued' | 'conflict';

export const LINE_STATE_LABEL: Record<LineState, string> = {
  pending: '미실사',
  counted: '완료',
  recount: '재실사 요청',
  queued: '보낼함 대기',
  conflict: '확인 필요',
};

export const LINE_STATE_TONE: Record<LineState, string> = {
  pending: 'pill--stone',
  counted: 'pill--ok',
  recount: 'pill--wine',
  queued: 'pill--warn',
  conflict: 'pill--wine',
};

/** 서버 상태 위에 기기 보낼함 상태를 얹은 화면용 상태 */
export function lineState(line: CountLineView, queued?: { state: string } | undefined): LineState {
  if (queued)
    return queued.state === 'conflict' || queued.state === 'failed' ? 'conflict' : 'queued';
  return line.status;
}
