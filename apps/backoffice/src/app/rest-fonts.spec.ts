import { attachRestFonts } from './rest-fonts';

const restLink = () =>
  document.head.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href$="/fonts/rest.css"]');

describe('attachRestFonts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('페이지를 다 받고 1초 뒤에 나머지 글꼴 CSS를 낮은 우선순위로 붙이고, 받으면 적용한다', () => {
    const cancel = attachRestFonts('fonts/rest.css');
    expect(restLink()).toBeNull();

    vi.advanceTimersByTime(1000);
    const link = restLink();
    expect(link?.media).toBe('print');

    link?.dispatchEvent(new Event('load'));
    expect(link?.media).toBe('all');

    cancel();
    expect(restLink()).toBeNull();
  });

  it('붙이기 전에 취소하면 아무것도 붙이지 않는다', () => {
    const cancel = attachRestFonts('fonts/rest.css');
    cancel();
    vi.advanceTimersByTime(5000);
    expect(restLink()).toBeNull();
  });
});
