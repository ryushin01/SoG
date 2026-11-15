/** 페이지를 다 받은 뒤 기다리는 시간. 첫 화면 그리기와 겹치지 않게 함 */
const DELAY_MS = 1000;
const IDLE_TIMEOUT_MS = 2000;

/**
 * 화면 글자 파일에 없는 한글(입력한 메모, 서버에서 온 품목 이름 등)을 위한 글꼴 조각 CSS를
 * 페이지를 다 받고 한가할 때 붙입니다. 조각 파일은 그 글자를 화면에 쓸 때만 받습니다. 취소 함수를 돌려줍니다.
 * href는 base href 기준 상대 주소(예: fonts/sog-sans-rest.css)입니다.
 */
export function attachRestFonts(href: string): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;
  let link: HTMLLinkElement | undefined;
  const attach = () => {
    const element = document.createElement('link');
    element.rel = 'stylesheet';
    element.href = new URL(href, document.baseURI).href;
    // print로 걸어 가장 낮은 우선순위로 받고, 다 받은 뒤 화면에 적용
    element.media = 'print';
    element.onload = () => {
      element.media = 'all';
    };
    document.head.append(element);
    link = element;
  };
  const schedule = () => {
    timer = setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function')
        idle = window.requestIdleCallback(attach, { timeout: IDLE_TIMEOUT_MS });
      else attach();
    }, DELAY_MS);
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
  return () => {
    clearTimeout(timer);
    window.removeEventListener('load', schedule);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    link?.remove();
  };
}
