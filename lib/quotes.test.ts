import { FALLBACK_QUOTES, getFallbackQuote } from "./quotes";

describe("getFallbackQuote", () => {
  it("returns a quote from the bundled pool", () => {
    expect(FALLBACK_QUOTES).toContainEqual(getFallbackQuote());
  });

  it("can reach every quote in the pool", () => {
    const seen = new Set<string>();
    for (let i = 0; i < FALLBACK_QUOTES.length; i++) {
      seen.add(getFallbackQuote(() => i / FALLBACK_QUOTES.length).text);
    }
    expect(seen.size).toBe(FALLBACK_QUOTES.length);
  });

  it("stays in bounds at the edges of the random range", () => {
    expect(getFallbackQuote(() => 0)).toEqual(FALLBACK_QUOTES[0]);
    expect(getFallbackQuote(() => 0.999999)).toEqual(
      FALLBACK_QUOTES[FALLBACK_QUOTES.length - 1],
    );
  });
});
