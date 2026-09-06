/**
 * Deep links the iOS widgets open (targets/widgets): `ontrack://today`,
 * `ontrack://goals` and `ontrack://goal/<id>`. In Expo Go the same paths
 * arrive as `exp://host/--/today`, so only the path after the scheme (and
 * the `--` marker) is inspected.
 */
export type WidgetLink =
  | { screen: "today" }
  | { screen: "goals" }
  | { screen: "goal"; goalId: string };

export const widgetLinkUrl = (link: WidgetLink): string => {
  switch (link.screen) {
    case "today":
      return "ontrack://today";
    case "goals":
      return "ontrack://goals";
    case "goal":
      return `ontrack://goal/${encodeURIComponent(link.goalId)}`;
  }
};

export const parseWidgetLink = (url: string): WidgetLink | null => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const segments = `${parsed.hostname}${parsed.pathname}`
    .split("/")
    .filter((segment) => segment.length > 0);
  // Drop everything up to and including Expo Go's "--" path marker.
  const marker = segments.indexOf("--");
  const path = marker === -1 ? segments : segments.slice(marker + 1);

  if (path.length === 1 && path[0] === "today") return { screen: "today" };
  if (path.length === 1 && path[0] === "goals") return { screen: "goals" };
  if (path.length === 2 && path[0] === "goal" && path[1]) {
    return { screen: "goal", goalId: decodeURIComponent(path[1]) };
  }
  return null;
};
