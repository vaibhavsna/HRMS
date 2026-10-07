import { describe, expect, it } from 'vitest';
import tokensCss from './tokens.css?raw';

/**
 * Guards the colour tokens: every text/background pair must meet WCAG AA in both themes
 * (4.5:1 for text, 3:1 for input borders and focus rings). Edit tokens.css freely; this fails
 * if a change makes something unreadable. Values are oklch, converted to sRGB here.
 */

interface Colour {
  rgb: [number, number, number];
  alpha: number;
}

type Palette = Record<string, Colour>;

const css = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function encode(linear: number): number {
  const c = clamp(linear);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function oklchToSrgb(l: number, chroma: number, hue: number, alpha: number): Colour {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const lp = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mp = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sp = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    rgb: [
      encode(4.0767416621 * lp - 3.3077115913 * mp + 0.2309699292 * sp),
      encode(-1.2684380046 * lp + 2.6097574011 * mp - 0.3413193965 * sp),
      encode(-0.0041960863 * lp - 0.7034186147 * mp + 1.707614701 * sp),
    ],
    alpha,
  };
}

function parseBlock(selector: string): Palette {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css);
  if (!block?.[1]) throw new Error(`No ${selector} block in tokens.css`);
  const palette: Palette = {};
  for (const match of block[1].matchAll(/--([a-z0-9-]+):\s*oklch\(([^)]+)\)/g)) {
    const [name, value] = [match[1], match[2]];
    if (!name || !value) continue;
    const [channels = '', alpha] = value.split('/');
    const [l, c, h] = channels.trim().split(/\s+/).map(Number);
    palette[name] = oklchToSrgb(l ?? 0, c ?? 0, h ?? 0, alpha ? parseFloat(alpha) / 100 : 1);
  }
  return palette;
}

function over(top: Colour, base: Colour): Colour {
  return {
    rgb: top.rgb.map(
      (c, i) => c * top.alpha + (base.rgb[i] ?? 0) * (1 - top.alpha),
    ) as Colour['rgb'],
    alpha: 1,
  };
}

function luminance({ rgb }: Colour): number {
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: Colour, b: Colour): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'muted'],
  ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'],
  ['success-foreground', 'success'],
  ['warning-foreground', 'warning'],
  ['info-foreground', 'info'],
  ['sidebar-foreground', 'sidebar'],
  ['sidebar-accent-foreground', 'sidebar-accent'],
  ['primary', 'background'], // primary used as link text
];

const STATUS = ['destructive', 'success', 'warning', 'info'] as const;

describe.each([
  ['light', ':root'],
  ['dark', '\\.dark'],
] as const)('%s theme colour tokens meet WCAG AA', (_theme, selector) => {
  const palette = parseBlock(selector);
  const token = (name: string): Colour => {
    const colour = palette[name];
    if (!colour) throw new Error(`Token --${name} is missing`);
    return colour;
  };

  it.each(TEXT_PAIRS)('text: --%s on --%s is at least 4.5:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(STATUS)('text: %s status badge (12%% tint over the card) is at least 4.5:1', (name) => {
    const tint = over({ ...token(name), alpha: 0.12 }, token('card'));
    expect(contrast(token(name), tint)).toBeGreaterThanOrEqual(4.5);
  });

  it('ui: form control borders are at least 3:1 against the page and the card', () => {
    expect(contrast(token('input'), token('background'))).toBeGreaterThanOrEqual(3);
    expect(contrast(token('input'), token('card'))).toBeGreaterThanOrEqual(3);
  });

  it('ui: the focus ring is at least 3:1 against the page and the card', () => {
    expect(contrast(token('ring'), token('background'))).toBeGreaterThanOrEqual(3);
    expect(contrast(token('ring'), token('card'))).toBeGreaterThanOrEqual(3);
  });
});

describe('tokens.css structure', () => {
  it('defines the same colour tokens in both themes', () => {
    expect(Object.keys(parseBlock('\\.dark')).sort()).toEqual(
      Object.keys(parseBlock(':root'))
        .filter((name) => name !== 'radius')
        .sort(),
    );
  });
});
