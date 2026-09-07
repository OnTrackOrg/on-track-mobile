import { parseWidgetLink, widgetLinkUrl } from "./widgetLinks";

describe("parseWidgetLink", () => {
  it("recognises the widget deep links", () => {
    expect(parseWidgetLink("ontrack://today")).toEqual({ screen: "today" });
    expect(parseWidgetLink("ontrack://goals")).toEqual({ screen: "goals" });
    expect(parseWidgetLink("ontrack://goal/abc-123")).toEqual({
      screen: "goal",
      goalId: "abc-123",
    });
  });

  it("accepts Expo Go's path form", () => {
    expect(parseWidgetLink("exp://192.168.1.2:8081/--/today")).toEqual({
      screen: "today",
    });
    expect(parseWidgetLink("exp://192.168.1.2:8081/--/goal/abc")).toEqual({
      screen: "goal",
      goalId: "abc",
    });
  });

  it("ignores everything else", () => {
    expect(parseWidgetLink("ontrack://auth/callback?code=1")).toBeNull();
    expect(parseWidgetLink("ontrack://goal")).toBeNull();
    expect(parseWidgetLink("ontrack://goal/a/b")).toBeNull();
    expect(parseWidgetLink("not a url")).toBeNull();
  });

  it("round-trips the URLs the widgets emit", () => {
    const link = { screen: "goal" as const, goalId: "id with space" };
    expect(parseWidgetLink(widgetLinkUrl(link))).toEqual(link);
    expect(parseWidgetLink(widgetLinkUrl({ screen: "goals" }))).toEqual({
      screen: "goals",
    });
  });
});
