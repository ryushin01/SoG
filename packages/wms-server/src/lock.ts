/**
 * 쓰기 직렬화. 같은 출처의 모든 탭이 Web Locks API의 배타 잠금 하나를 나눠 씁니다.
 * 읽고-계산하고-쓰는 사이에 다른 탭이 끼어들지 못하므로, 재고가 음수가 되거나 이동이 두 번 반영되지 않습니다.
 * Web Locks가 없는 환경(Node 테스트)에서는 탭 안의 큐로 대신합니다.
 */
export type Lock = <T>(work: () => Promise<T>) => Promise<T>;

export function createLock(name: string): Lock {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks) {
    return (work) => locks.request(name, { mode: 'exclusive' }, work);
  }
  return <T>(work: () => Promise<T>) => {
    const tail = fallbackTails.get(name) ?? Promise.resolve();
    const run = tail.then(work, work);
    fallbackTails.set(
      name,
      run.catch(() => undefined),
    );
    return run;
  };
}

/** 같은 이름의 잠금은 같은 큐를 씁니다. 한 프로세스에서 서버 여러 개(탭 여러 개)를 흉내 낼 때 필요합니다. */
const fallbackTails = new Map<string, Promise<unknown>>();
