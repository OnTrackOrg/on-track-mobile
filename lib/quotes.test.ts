import AsyncStorage from "@react-native-async-storage/async-storage";
import { format } from "date-fns";
import { FALLBACK_QUOTES, getFallbackQuote, getQuoteOfTheDay } from "./quotes";
import { STORAGE_KEYS } from "./persistence";

describe("getFallbackQuote", () => {
  it("is deterministic for a given day", () => {
    const date = new Date(2026, 6, 23);
    expect(getFallbackQuote(date)).toEqual(getFallbackQuote(date));
  });

  it("rotates through the bundled list day by day", () => {
    const seen = new Set<string>();
    for (let i = 0; i < FALLBACK_QUOTES.length; i++) {
      seen.add(getFallbackQuote(new Date(2026, 0, 1 + i)).text);
    }
    expect(seen.size).toBe(FALLBACK_QUOTES.length);
  });
});

describe("getQuoteOfTheDay", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("returns the cached quote when it is from today", async () => {
    const today = new Date();
    await AsyncStorage.setItem(
      STORAGE_KEYS.quoteOfTheDay,
      JSON.stringify({
        text: "Cached wisdom.",
        author: "Cache",
        date: format(today, "yyyy-MM-dd"),
      }),
    );
    await expect(getQuoteOfTheDay(today)).resolves.toEqual({
      text: "Cached wisdom.",
      author: "Cache",
    });
  });

  it("falls back to the bundled rotation for a stale cache", async () => {
    const today = new Date();
    await AsyncStorage.setItem(
      STORAGE_KEYS.quoteOfTheDay,
      JSON.stringify({
        text: "Old wisdom.",
        author: "Cache",
        date: "2020-01-01",
      }),
    );
    await expect(getQuoteOfTheDay(today)).resolves.toEqual(
      getFallbackQuote(today),
    );
  });

  it("falls back on malformed cache", async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.quoteOfTheDay, "not json");
    const today = new Date();
    await expect(getQuoteOfTheDay(today)).resolves.toEqual(
      getFallbackQuote(today),
    );
  });
});
