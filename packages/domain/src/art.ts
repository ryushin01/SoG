/** 품목 그림. 사진 대신 모양(shape)과 색상값(hue)으로 스튜디오 제품 사진 같은 SVG를 그립니다. */
import type { SkuShape } from './types';

interface ArtInput {
  shape: SkuShape;
  hue: number;
  code: string;
}

export type ArtView = 'front' | 'angle' | 'label';

const W = 600;
const H = 720;

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)} ${s}% ${l}%)`;
}

function body(shape: SkuShape, hue: number, id: string): string {
  const base = hsl(hue, 34, 58);
  const dark = hsl(hue, 30, 38);
  const light = hsl(hue, 40, 74);
  const grad = `<linearGradient id="g${id}" x1="0" x2="1"><stop offset="0" stop-color="${dark}"/><stop offset=".45" stop-color="${base}"/><stop offset=".7" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`;
  const fill = `url(#g${id})`;
  const label = (x: number, y: number, w: number, h: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f7f5f0" opacity=".92"/>` +
    `<rect x="${x + 14}" y="${y + 16}" width="${w * 0.45}" height="6" fill="${dark}"/>` +
    `<rect x="${x + 14}" y="${y + 30}" width="${w * 0.3}" height="4" fill="${dark}" opacity=".5"/>` +
    barcode(x + w - 86, y + h - 40, 72, 28);

  switch (shape) {
    case 'box':
      return (
        `<defs>${grad}</defs>` +
        `<path d="M160 250 L300 200 L440 250 L440 520 L300 570 L160 520 Z" fill="${dark}"/>` +
        `<path d="M160 250 L300 300 L300 570 L160 520 Z" fill="${fill}"/>` +
        `<path d="M300 300 L440 250 L440 520 L300 570 Z" fill="${base}" opacity=".85"/>` +
        `<path d="M160 250 L300 200 L440 250 L300 300 Z" fill="${light}"/>` +
        `<path d="M230 225 L370 275" stroke="#f7f5f0" stroke-width="18" opacity=".55"/>` +
        `<g transform="translate(176 360) skewY(20)">${label(0, 0, 108, 92)}</g>`
      );
    case 'bottle':
      return (
        `<defs>${grad}</defs>` +
        `<rect x="270" y="168" width="60" height="44" rx="6" fill="${dark}"/>` +
        `<path d="M276 212 h48 v38 q70 30 70 100 v190 q0 26 -26 26 h-136 q-26 0 -26 -26 v-190 q0 -70 70 -100 Z" fill="${fill}"/>` +
        label(222, 380, 156, 110) +
        `<rect x="236" y="290" width="14" height="200" rx="7" fill="#fff" opacity=".22"/>`
      );
    case 'can':
      return (
        `<defs>${grad}</defs>` +
        `<rect x="200" y="230" width="200" height="320" fill="${fill}"/>` +
        `<ellipse cx="300" cy="230" rx="100" ry="26" fill="${light}"/>` +
        `<ellipse cx="300" cy="230" rx="84" ry="19" fill="${base}"/>` +
        `<path d="M200 550 a100 26 0 0 0 200 0" fill="${dark}"/>` +
        label(214, 340, 172, 120)
      );
    case 'pouch':
      return (
        `<defs>${grad}</defs>` +
        `<path d="M196 214 h208 l18 330 q2 22 -20 22 h-204 q-22 0 -20 -22 Z" fill="${fill}"/>` +
        `<rect x="196" y="214" width="208" height="26" fill="${dark}" opacity=".6"/>` +
        `<circle cx="300" cy="256" r="8" fill="#f2efe8"/>` +
        label(222, 360, 156, 116)
      );
    case 'tube':
      return (
        `<defs>${grad}</defs>` +
        `<path d="M232 196 h136 l-10 300 h-116 Z" fill="${fill}"/>` +
        `<rect x="226" y="184" width="148" height="18" fill="${dark}"/>` +
        `<rect x="262" y="496" width="76" height="70" rx="8" fill="${dark}"/>` +
        label(246, 300, 108, 120)
      );
    case 'roll':
      return (
        `<defs>${grad}</defs>` +
        `<rect x="180" y="300" width="240" height="210" fill="${fill}"/>` +
        `<ellipse cx="180" cy="405" rx="44" ry="105" fill="${light}"/>` +
        `<ellipse cx="180" cy="405" rx="16" ry="38" fill="${dark}"/>` +
        `<path d="M420 300 a44 105 0 0 1 0 210" fill="${dark}"/>` +
        `<rect x="260" y="372" width="120" height="70" fill="#f7f5f0" opacity=".9"/>` +
        barcode(282, 396, 76, 30)
      );
  }
}

function barcode(x: number, y: number, w: number, h: number): string {
  const widths = [2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 2];
  let cursor = x;
  let bars = '';
  widths.forEach((bw, i) => {
    if (i % 2 === 0)
      bars += `<rect x="${cursor}" y="${y}" width="${bw * 1.6}" height="${h}" fill="#262933"/>`;
    cursor += bw * 2.3;
    if (cursor > x + w) return;
  });
  return bars;
}

/** 품목 그림 SVG 문자열 */
export function skuArtSvg(input: ArtInput, view: ArtView = 'front'): string {
  const id = input.code.replace(/[^a-z0-9]/gi, '') + view;
  const bg = view === 'label' ? hsl(input.hue, 18, 90) : '#efece6';
  const floor = view === 'label' ? hsl(input.hue, 16, 84) : '#e4e0d8';
  const inner =
    view === 'angle'
      ? `<g transform="translate(300 380) rotate(-12) scale(1.02) translate(-300 -380)">${body(input.shape, input.hue, id)}</g>`
      : view === 'label'
        ? `<g transform="translate(300 400) scale(1.75) translate(-300 -420)">${body(input.shape, input.hue, id)}</g>`
        : body(input.shape, input.hue, id);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${bg}"/>` +
    `<ellipse cx="300" cy="590" rx="190" ry="26" fill="${floor}"/>` +
    inner +
    `<text x="32" y="${H - 32}" font-family="ui-monospace, monospace" font-size="18" fill="#262933" opacity=".55">${input.code}</text>` +
    `</svg>`
  );
}

/** img src에 바로 쓰는 data URL */
export function skuArtUrl(input: ArtInput, view: ArtView = 'front'): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(skuArtSvg(input, view))}`;
}
