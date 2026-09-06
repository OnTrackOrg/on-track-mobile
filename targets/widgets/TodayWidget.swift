import SwiftUI
import WidgetKit

// 1a "Today ring" (small) and 1f lock-screen accessories: the Today tab's
// summary card, lifted straight off the screen. Default widget.

struct TodayEntry: TimelineEntry {
  let date: Date
  let day: WidgetDay
  let accent: String
}

struct TodayProvider: TimelineProvider {
  func placeholder(in context: Context) -> TodayEntry {
    TodayEntry(date: Date(), day: SampleData.day, accent: SampleData.accent)
  }

  func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
    if context.isPreview {
      completion(placeholder(in: context))
      return
    }
    let now = Date()
    let snapshot = WidgetStore.load()
    completion(
      TodayEntry(
        date: now,
        day: snapshot?.day(for: now) ?? SampleData.day,
        accent: snapshot?.accent ?? SampleData.accent
      ))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
    let now = Date()
    guard let snapshot = WidgetStore.load() else {
      completion(Timeline(entries: [placeholder(in: context)], policy: .never))
      return
    }
    let entries = WidgetStore.entryDates(for: snapshot, now: now).map { date, day in
      TodayEntry(date: date, day: day, accent: snapshot.accent)
    }
    completion(Timeline(entries: entries.isEmpty ? [placeholder(in: context)] : entries, policy: .atEnd))
  }
}

struct TodayWidgetView: View {
  let entry: TodayEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var colorScheme

  private var theme: WidgetTheme {
    WidgetTheme(accentHex: entry.accent, isDark: colorScheme == .dark)
  }

  var body: some View {
    switch family {
    case .accessoryCircular:
      circular
    case .accessoryRectangular:
      rectangular
    default:
      small
    }
  }

  private var headline: (title: String, detail: String) {
    let day = entry.day
    if day.total == 0 { return ("Nothing due", "Enjoy the day") }
    if day.allDone { return ("All done", "See you tomorrow") }
    return ("Keep it moving", "\(day.left) left today")
  }

  // MARK: Home screen (1a)

  private var small: some View {
    let theme = theme
    let day = entry.day
    return VStack(alignment: .leading, spacing: 0) {
      HStack {
        SectionLabel(text: "TODAY", theme: theme)
        Spacer()
        AppIconMark()
      }
      Spacer(minLength: 6)
      HStack(spacing: 8) {
        RingView(
          percent: day.total == 0 ? 0 : Double(day.done) / Double(day.total),
          size: 64, lineWidth: 8, color: theme.accent, track: theme.ringTrack
        ) {
          Text("\(day.done)/\(day.total)")
            .font(.system(size: 14, weight: .heavy))
            .foregroundStyle(theme.text)
        }
        if day.allDone {
          TrophyChip(accent: theme.accent)
        }
      }
      Spacer(minLength: 6)
      VStack(alignment: .leading, spacing: 1) {
        Text(headline.title)
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(theme.text)
        Text(headline.detail)
          .font(.system(size: 12))
          .foregroundStyle(theme.textSecondary)
      }
      .lineLimit(1)
    }
    .padding(16)
    .widgetSurface(theme)
    .widgetURL(WidgetLinks.today)
  }

  // MARK: Lock screen (1f)

  private var circular: some View {
    let day = entry.day
    return ZStack {
      AccessoryWidgetBackground()
      RingView(
        percent: day.total == 0 ? 0 : Double(day.done) / Double(day.total),
        size: 54, lineWidth: 6, color: .white, track: .white.opacity(0.22)
      ) {
        Text("\(day.done)/\(day.total)")
          .font(.system(size: 13, weight: .heavy))
          .foregroundStyle(.white)
          .minimumScaleFactor(0.7)
      }
    }
    .containerBackground(for: .widget) { Color.clear }
    .widgetURL(WidgetLinks.today)
  }

  private var rectangular: some View {
    let day = entry.day
    let streak = day.bestStreak
    return ZStack {
      AccessoryWidgetBackground()
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 4) {
          Image(systemName: streak > 0 ? "bolt.fill" : "checkmark.circle.fill")
            .font(.system(size: 11, weight: .bold))
          Text(streak > 0 ? "\(streak) day streak" : "\(day.done)/\(day.total) done today")
            .font(.system(size: 13, weight: .heavy))
        }
        .foregroundStyle(.white)
        Text(rectangularDetail)
          .font(.system(size: 12))
          .foregroundStyle(.white.opacity(0.75))
      }
      .lineLimit(1)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
    }
    .containerBackground(for: .widget) { Color.clear }
    .widgetURL(WidgetLinks.today)
  }

  private var rectangularDetail: String {
    let day = entry.day
    if let next = day.nextTask { return "Next: \(next)" }
    if day.total == 0 { return "Nothing due today" }
    return "All done for today"
  }
}

struct TodayWidget: Widget {
  let kind = "OnTrackToday"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
      TodayWidgetView(entry: entry)
    }
    .configurationDisplayName("Today")
    .description("Your day's tasks in one ring.")
    .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    .contentMarginsDisabled()
  }
}
