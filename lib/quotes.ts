import Constants from "expo-constants";

// API key resolution mirrors lib/supabase.ts: app config extra first, then
// EXPO_PUBLIC env for local dev.
const expoExtra = (Constants.expoConfig?.extra ?? {}) as {
  apiNinjasKey?: string;
};
const API_NINJAS_KEY =
  expoExtra.apiNinjasKey ?? process.env.EXPO_PUBLIC_API_NINJAS_KEY;

export interface Quote {
  text: string;
  author: string;
}

// Offline pool so the launch screen never waits on the network. The
// first three are the quotes from the redesign mockups (2a-2c).
export const FALLBACK_QUOTES: Quote[] = [
  {
    text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
    author: "Will Durant",
  },
  {
    text: "A journey of a thousand miles begins with a single step.",
    author: "Lao Tzu",
  },
  {
    text: "It always seems impossible until it's done.",
    author: "Nelson Mandela",
  },
  { text: "Well begun is half done.", author: "Aristotle" },
  {
    text: "Success is the sum of small efforts, repeated day in and day out.",
    author: "Robert Collier",
  },
  {
    text: "How we spend our days is, of course, how we spend our lives.",
    author: "Annie Dillard",
  },
  {
    text: "You do not rise to the level of your goals. You fall to the level of your systems.",
    author: "James Clear",
  },
  { text: "What gets measured gets managed.", author: "Peter Drucker" },
  {
    text: "The secret of getting ahead is getting started.",
    author: "Mark Twain",
  },
  {
    text: "It does not matter how slowly you go as long as you do not stop.",
    author: "Confucius",
  },
  {
    text: "Motivation is what gets you started. Habit is what keeps you going.",
    author: "Jim Ryun",
  },
  {
    text: "The best time to plant a tree was 20 years ago. The second best time is now.",
    author: "Chinese proverb",
  },
];

export const getFallbackQuote = (
  random: () => number = Math.random,
): Quote => {
  const index = Math.floor(random() * FALLBACK_QUOTES.length);
  return FALLBACK_QUOTES[
    ((index % FALLBACK_QUOTES.length) + FALLBACK_QUOTES.length) %
      FALLBACK_QUOTES.length
  ];
};

/**
 * Fetch a random quote from API Ninjas for the current session. Best-effort:
 * resolves null on any failure (offline, timeout, bad payload, missing key)
 * so callers stay on the bundled fallback. Never throws.
 */
export const fetchRandomQuote = async (): Promise<Quote | null> => {
  if (!API_NINJAS_KEY) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(
      "https://api.api-ninjas.com/v2/randomquotes?categories=inspirational,success",
      {
        signal: controller.signal,
        headers: { "X-Api-Key": API_NINJAS_KEY },
      },
    );
    clearTimeout(timer);
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      quote?: string;
      author?: string;
    }[];
    const text = payload?.[0]?.quote?.trim();
    const author = payload?.[0]?.author?.trim();
    if (!text || !author) return null;
    return { text, author };
  } catch {
    return null;
  }
};
