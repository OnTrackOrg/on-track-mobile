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
