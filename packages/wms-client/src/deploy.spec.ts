import { afterEach, describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, reloadOnStaleChunk } from './deploy';

describe('배포 뒤 사라진 화면 조각', () => {
  afterEach(() => sessionStorage.clear());

  it('브라우저마다 다른 조각 실패 문구를 알아본다', () => {
    expect(
      isChunkLoadError(
        new TypeError('Failed to fetch dynamically imported module: https://x/chunk-A.js'),
      ),
    ).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(
      isChunkLoadError(new Error('error loading dynamically imported module: https://x/a.js')),
    ).toBe(true);
    expect(isChunkLoadError(new Error('NG04002: Cannot match any routes'))).toBe(false);
    expect(isChunkLoadError('chunk')).toBe(false);
  });

  it('되풀이를 막는 기록을 남기지 못하면 자동으로 열지 않는다', () => {
    const open = vi.fn();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('가득 참', 'QuotaExceededError');
    });
    reloadOnStaleChunk(
      { url: '/map', error: new TypeError('Failed to fetch dynamically imported module: x') },
      open,
    );
    expect(open).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('누른 화면 주소를 새로 열고, 방금 연 주소가 또 실패하면 되풀이하지 않는다', () => {
    const open = vi.fn();
    const error = new TypeError('Failed to fetch dynamically imported module: x');
    reloadOnStaleChunk({ url: '/map?loc=A', error }, open);
    expect(open).toHaveBeenCalledWith(new URL('map?loc=A', document.baseURI).href);
    reloadOnStaleChunk({ url: '/map?loc=A', error }, open);
    expect(open).toHaveBeenCalledOnce();
    // 조각 실패가 아닌 오류는 건드리지 않습니다.
    reloadOnStaleChunk({ url: '/inventory', error: new Error('boom') }, open);
    expect(open).toHaveBeenCalledOnce();
  });
});
