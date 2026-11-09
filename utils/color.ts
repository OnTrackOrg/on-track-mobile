// Small color helpers standing in for CSS `color-mix()` from the redesign
// mockups. All inputs are 6-digit hex; outputs are 6-digit hex.

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

const parseHex = (hex: string): [number, number, number] => {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
};

const toHex = (r: number, g: number, b: number): string =>
  "#" +
  [r, g, b].map((c) => clamp255(c).toString(16).padStart(2, "0")).join("");

/**
 * Mix `amount` (0..1) of `color` into `base`, like
 * `color-mix(in srgb, color <amount*100>%, base)`.
 */
export const mix = (color: string, amount: number, base: string): string => {
  const [r1, g1, b1] = parseHex(color);
  const [r2, g2, b2] = parseHex(base);
  const t = Math.max(0, Math.min(1, amount));
  return toHex(
    r1 * t + r2 * (1 - t),
    g1 * t + g2 * (1 - t),
    b1 * t + b2 * (1 - t),
  );
};

/** #rrggbb + 0..1 alpha -> #rrggbbaa (RN accepts 8-digit hex). */
export const withAlpha = (hex: string, alpha: number): string => {
  const a = clamp255(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return hex + a;
};

export type HSV = { h: number; s: number; v: number };

/** Hue in degrees; saturation and brightness in 0..1. */
export const hexToHsv = (hex: string): HSV => {
  const [r, g, b] = parseHex(hex).map((channel) => channel / 255);
  const v = Math.max(r, g, b);
  const delta = v - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (v === r) h = ((g - b) / delta) % 6;
    else if (v === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: v === 0 ? 0 : delta / v, v };
};

export const hsvToHex = ({ h, s, v }: HSV): string => {
  const hue = (((h % 360) + 360) % 360) / 60;
  const brightness = Math.max(0, Math.min(1, v));
  const chroma = brightness * Math.max(0, Math.min(1, s));
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const channels =
    hue < 1
      ? [chroma, x, 0]
      : hue < 2
        ? [x, chroma, 0]
        : hue < 3
          ? [0, chroma, x]
          : hue < 4
            ? [0, x, chroma]
            : hue < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const [r, g, b] = channels.map(
    (channel) => (channel + brightness - chroma) * 255,
  );
  return toHex(r, g, b);
};
