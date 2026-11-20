import { render, screen } from '@testing-library/angular';
import { SkuBarcode } from './sku-barcode';

describe('SkuBarcode', () => {
  it('EAN-13을 막대 30개(숫자 12자리 × 2 + 가드 3쌍)로 그리고, 그림 이름으로 숫자를 읽힌다', async () => {
    const { container } = await render(SkuBarcode, { inputs: { code: '8800102010004' } });
    const svg = screen.getByRole('img', { name: '바코드 8800102010004' });
    expect(svg.querySelectorAll('rect')).toHaveLength(30);
    // 아래 숫자는 눈으로 보는 용도라 화면 낭독기가 두 번 읽지 않게 숨깁니다.
    expect(container.querySelector('.digits')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('가드 막대는 숫자 막대보다 길다', async () => {
    const { container } = await render(SkuBarcode, { inputs: { code: '8800102010004' } });
    const heights = [...container.querySelectorAll('rect')].map((rect) =>
      Number(rect.getAttribute('height')),
    );
    expect(heights.filter((h) => h === 56)).toHaveLength(6);
    expect(heights.filter((h) => h === 50)).toHaveLength(24);
  });

  it('검증 숫자가 틀린 코드는 막대 없이 숫자만 보여 준다', async () => {
    await render(SkuBarcode, { inputs: { code: '8800102010001' } });
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('8800102010001').getAttribute('aria-hidden')).toBeNull();
  });
});
