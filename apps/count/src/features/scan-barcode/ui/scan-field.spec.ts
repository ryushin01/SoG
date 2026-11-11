import type { CountLineView } from '@sog/domain';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ScanField } from './scan-field';

function line(id: string, barcode: string, status: CountLineView['status']): CountLineView {
  return {
    id,
    status,
    sku: {
      id: 's',
      code: 'SOG-1',
      name: '테스트 품목',
      barcode,
      unit: 'EA',
      unitCost: 1,
      shape: 'box',
      hue: 1,
      category: 'tools',
    },
  } as CountLineView;
}

describe('ScanField', () => {
  it('바코드로 아직 세지 않은 줄을 먼저 찾는다', async () => {
    const found = vi.fn();
    const lines = [line('a', '8800000000001', 'counted'), line('b', '8800000000001', 'pending')];
    await render(ScanField, { inputs: { lines }, on: { found } });

    await userEvent.type(screen.getByLabelText('바코드 스캔'), '8800000000001{Enter}');

    expect(found).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('작업에 없는 바코드면 알려 준다', async () => {
    await render(ScanField, { inputs: { lines: [line('a', '8800000000001', 'pending')] } });

    await userEvent.type(screen.getByLabelText('바코드 스캔'), '123{Enter}');

    expect(screen.getByText(/이 작업에 없는 바코드입니다/)).toBeTruthy();
  });

  describe('카메라 스캔', () => {
    afterEach(() => {
      delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
      Reflect.deleteProperty(navigator, 'mediaDevices');
    });

    it('BarcodeDetector가 없는 기기에서는 카메라 버튼을 숨긴다', async () => {
      await render(ScanField, { inputs: { lines: [] } });
      expect(screen.queryByRole('button', { name: '카메라로 스캔' })).toBeNull();
    });

    it('카메라를 켜는 도중 닫으면 늦게 받은 카메라를 바로 끈다', async () => {
      (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
        detect() {
          return Promise.resolve([]);
        }
      };
      let resolveStream!: (stream: MediaStream) => void;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: () => new Promise<MediaStream>((resolve) => (resolveStream = resolve)),
        },
      });
      // jsdom에는 showModal이 없어 열림 상태만 흉내 냅니다.
      HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
      HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      };
      await render(ScanField, { inputs: { lines: [] } });
      await userEvent.click(screen.getByRole('button', { name: '카메라로 스캔' }));
      await userEvent.click(screen.getByRole('button', { name: '닫기', hidden: true }));

      const stop = vi.fn();
      resolveStream({ getTracks: () => [{ stop }] } as unknown as MediaStream);
      await vi.waitFor(() => expect(stop).toHaveBeenCalled());
    });

    it('BarcodeDetector와 카메라가 있으면 카메라 버튼을 보여 준다', async () => {
      (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
        detect() {
          return Promise.resolve([]);
        }
      };
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: () => Promise.reject(new Error('denied')) },
      });
      await render(ScanField, { inputs: { lines: [] } });
      expect(screen.getByRole('button', { name: '카메라로 스캔' })).toBeTruthy();
    });
  });
});
