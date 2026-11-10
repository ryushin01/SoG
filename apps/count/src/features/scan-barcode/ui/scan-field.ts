import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { CountLineView } from '@sog/domain';

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function detectorClass(): BarcodeDetectorConstructor | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  const media =
    typeof navigator !== 'undefined'
      ? (navigator.mediaDevices as MediaDevices | undefined)
      : undefined;
  return ctor && typeof media?.getUserMedia === 'function' ? ctor : null;
}

/**
 * 바코드 입력. 현장 스캐너는 키보드처럼 숫자를 치고 Enter를 보내므로 일반 입력란으로 받습니다.
 * 휴대폰처럼 BarcodeDetector와 카메라가 있으면 카메라로도 찍을 수 있습니다(없으면 버튼을 숨깁니다).
 * 같은 품목이 여러 로케이션에 있으면 아직 세지 않은 줄을 먼저 고릅니다.
 */
@Component({
  selector: 'cnt-scan-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="scan" (submit)="find($event)" role="search" aria-label="바코드로 품목 찾기">
      <label class="label" for="scan-input">바코드 스캔</label>
      <div class="scan__row">
        <input
          id="scan-input"
          class="input"
          inputmode="numeric"
          autocomplete="off"
          enterkeyhint="search"
          placeholder="바코드 또는 품목 코드"
          aria-describedby="scan-hint scan-message"
          [value]="value()"
          (input)="value.set($any($event.target).value)"
        />
        <button type="submit" class="btn">찾기</button>
      </div>
      @if (cameraSupported) {
        <button type="button" class="btn btn--block camera-btn" (click)="openCamera()">
          카메라로 스캔
        </button>
      }
      <p id="scan-hint" class="hint">스캐너로 찍거나 숫자를 입력한 뒤 찾기를 누릅니다.</p>
      <p id="scan-message" class="error" aria-live="polite">{{ message() }}</p>
    </form>

    @if (cameraSupported) {
      <dialog #dialog class="camera" aria-labelledby="camera-title" (close)="stopCamera()">
        <div class="camera__head">
          <h2 id="camera-title" class="camera__title">카메라로 바코드 찍기</h2>
          <button type="button" class="btn" (click)="closeCamera()">닫기</button>
        </div>
        <video #video class="camera__video" playsinline muted aria-hidden="true"></video>
        <p class="hint camera__hint" aria-live="polite">{{ cameraMessage() }}</p>
      </dialog>
    }
  `,
  styles: `
    .scan__row {
      display: flex;
      gap: 0.5rem;
    }
    .scan__row .btn {
      flex: none;
    }
    .camera-btn {
      margin-top: 0.5rem;
    }
    .scan .hint {
      margin-top: 0.375rem;
    }
    .error:empty {
      display: none;
    }
    .camera {
      width: min(30rem, calc(100vw - 2rem));
      padding: 0;
      border: 1px solid var(--ink);
      border-radius: var(--radius);
      background: var(--paper);
    }
    .camera::backdrop {
      background: rgb(0 0 0 / 0.6);
    }
    .camera__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem 1rem;
    }
    .camera__title {
      font-size: 1rem;
    }
    .camera__video {
      display: block;
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: cover;
      background: #000;
    }
    .camera__hint {
      padding: 0.75rem 1rem 1rem;
    }
  `,
})
export class ScanField {
  readonly lines = input.required<CountLineView[]>();
  readonly found = output<CountLineView>();
  protected readonly value = signal('');
  protected readonly message = signal('');
  protected readonly cameraMessage = signal('');
  protected readonly cameraSupported = detectorClass() !== null;

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private stream: MediaStream | null = null;
  private frame = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopCamera());
  }

  protected find(event: Event): void {
    event.preventDefault();
    this.lookup(this.value());
  }

  protected async openCamera(): Promise<void> {
    const Detector = detectorClass();
    const dialog = this.dialog()?.nativeElement;
    const video = this.video()?.nativeElement;
    if (!Detector || !dialog || !video) return;
    this.cameraMessage.set('카메라를 켜는 중입니다.');
    dialog.showModal();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      video.srcObject = this.stream;
      await video.play();
      this.cameraMessage.set('바코드를 화면 가운데에 맞춰 주세요.');
      const detector = new Detector({ formats: ['ean_13', 'code_128', 'qr_code'] });
      const scan = async () => {
        if (!this.stream) return;
        const [code] = await detector.detect(video).catch(() => [] as DetectedBarcode[]);
        if (code?.rawValue) {
          this.closeCamera();
          this.value.set(code.rawValue);
          this.lookup(code.rawValue);
          return;
        }
        this.frame = requestAnimationFrame(() => void scan());
      };
      void scan();
    } catch {
      this.stopCamera();
      this.cameraMessage.set(
        '카메라를 쓸 수 없습니다. 권한을 확인하거나 숫자를 직접 입력해 주세요.',
      );
    }
  }

  protected closeCamera(): void {
    this.stopCamera();
    const dialog = this.dialog()?.nativeElement;
    if (dialog?.open) dialog.close();
  }

  protected stopCamera(): void {
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private lookup(raw: string): void {
    const code = raw.trim().toUpperCase();
    if (!code) {
      this.message.set('바코드를 입력해 주세요.');
      return;
    }
    const matches = this.lines().filter(
      (line) => line.sku.barcode === code || line.sku.code.toUpperCase() === code,
    );
    const target = matches.find((line) => line.status !== 'counted') ?? matches[0];
    if (!target) {
      this.message.set(`이 작업에 없는 바코드입니다: ${code}`);
      navigator.vibrate?.([60, 60, 60]);
      return;
    }
    this.message.set('');
    this.value.set('');
    // 장갑을 끼고 화면을 보지 않아도 찾았는지 알 수 있게 짧게 진동합니다.
    navigator.vibrate?.(40);
    this.found.emit(target);
  }
}
