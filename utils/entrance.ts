// The staggered rise-in entrance plays once per screen per app session
// (redesign mockup 1a: "Entrance plays once per session per tab").
const visited = new Set<string>();

export const shouldPlayEntrance = (screen: string): boolean => {
  if (visited.has(screen)) return false;
  visited.add(screen);
  return true;
};
