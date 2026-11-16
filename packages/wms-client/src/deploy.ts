const KEY = 'sog:chunk-reload';
/** 같은 주소를 방금 새로 열었는데도 실패하면 되풀이하지 않습니다(정말로 없는 파일이면 무한 새로 고침이 됨). */
const RETRY_WINDOW_MS = 10_000;

/** 화면 조각(지연 로딩한 JS)을 받지 못한 오류인지. 브라우저마다 문구가 다릅니다. */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'ChunkLoadError' ||
    /dynamically imported module|Importing a module script failed|Failed to load module script/i.test(
      error.message,
    )
  );
}

/**
 * 배포 뒤 열어 둔 탭이 새 버전에서 사라진 화면 조각을 받지 못하면(이전 빌드의 파일 이름), 그 주소를 새로 엽니다.
 * 새 index.html과 새 조각을 받으므로 사용자는 누른 화면으로 그대로 갑니다. 라우터의 `withNavigationErrorHandler`에 넣습니다.
 */
export function reloadOnStaleChunk(
  event: { url: string; error: unknown },
  open: (url: string) => void = (url) => location.assign(url),
): void {
  if (!isChunkLoadError(event.error) || typeof document === 'undefined') return;
  const target = new URL(event.url.replace(/^\//, ''), document.baseURI).href;
  try {
    const last = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as {
      url: string;
      at: number;
    } | null;
    if (last && last.url === target && Date.now() - last.at < RETRY_WINDOW_MS) return;
    sessionStorage.setItem(KEY, JSON.stringify({ url: target, at: Date.now() }));
  } catch {
    // 기록을 남길 수 없으면(저장 공간 가득 참 등) 되풀이를 막을 수 없으므로 자동으로 열지 않습니다.
    return;
  }
  open(target);
}
