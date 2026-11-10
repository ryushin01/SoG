import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type ArtView, type Sku, skuArtUrl } from '@sog/domain';

/** 코드로 그린 품목 그림 */
@Component({
  selector: 'sog-sku-art',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<img
    [src]="src()"
    [alt]="alt()"
    [width]="size()"
    [height]="size() * 1.2"
    loading="lazy"
    decoding="async"
  />`,
  styles: `
    :host {
      display: block;
    }
    img {
      width: 100%;
      height: auto;
      background: #efece6;
    }
  `,
})
export class SkuArt {
  readonly sku = input.required<Pick<Sku, 'shape' | 'hue' | 'code' | 'name'>>();
  readonly view = input<ArtView>('front');
  readonly size = input(120);
  /** 이름이 옆에 이미 있으면 빈 문자열로 꾸밈 그림 처리 */
  readonly decorative = input(false);
  protected readonly src = computed(() => skuArtUrl(this.sku(), this.view()));
  protected readonly alt = computed(() => (this.decorative() ? '' : `${this.sku().name} 그림`));
}
