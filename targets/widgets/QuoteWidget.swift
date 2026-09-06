import SwiftUI
import WidgetKit

// 1e "Quote + ring" (medium): the launch-screen quote pool, rotated daily,
// with today's ring beside it. For people who want a calm widget rather
// than a scoreboard.

struct QuoteEntry: TimelineEntry {
  let date: Date
  let day: WidgetDay
  let accent: String
}

struct QuoteProvider: TimelineProvider {
  func placeholder(in context: Context) -> QuoteEntry {
    QuoteEntry(date: Date(), day: SampleData.day, accent: SampleData.accent)
  }

  func getSnapshot(in context: Context, completion: @escaping (QuoteEntry) -> Void) {
    if context.isPreview {
      completion(placeholder(in: context))
      return
    }
    let now = Date()
    let snapshot = WidgetStore.load()
    completion(
      QuoteEntry(
        date: now,
        day: snapshot?.day(for: now) ?? SampleData.day,
        accent: snapshot?.accent ?? SampleData.accent
      ))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<QuoteEntry>) -> Void) {
    let now = Date()
    guard let snapshot = WidgetStore.load() else {
      completion(Timeline(entries: [placeholder(in: context)], policy: .never))
      return
    }
    let entries = WidgetStore.entryDates(for: snapshot, now: now).map { date, day in
      QuoteEntry(date: date, day: day, accent: snapshot.accent)
    }
    completion(Timeline(entries: entries.isEmpty ? [placeholder(in: context)] : entries, policy: .atEnd))
  }
}

struct QuoteWidgetView: View {
  let entry: QuoteEntry
  @Environment(\.colorScheme) private var colorScheme

  private var theme: WidgetTheme {
    WidgetTheme(accentHex: entry.accent, isDark: colorScheme == .dark)
  }

  var body: some View {
    let theme = theme
    let day = entry.day
    HStack(spacing: 18) {
      VStack(alignment: .leading, spacing: 8) {
        Text("\u{201C}\(day.quote.text)\u{201D}")
          .font(.system(size: 16, weight: .semibold))
          .lineSpacing(4)
          .foregroundStyle(theme.text)
          .lineLimit(4)
          .minimumScaleFactor(0.8)
        Text(day.quote.author)
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(theme.textSecondary)
          .lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      RingView(
        percent: day.total == 0 ? 0 : Double(day.done) / Double(day.total),
        size: 72, lineWidth: 8, color: theme.accent, track: theme.ringTrack
      ) {
        Text("\(day.done)/\(day.total)")
          .font(.system(size: 15, weight: .heavy))
          .foregroundStyle(theme.text)
      }
    }
    .padding(EdgeInsets(top: 18, leading: 20, bottom: 18, trailing: 20))
    .widgetSurface(theme)
    .widgetURL(WidgetLinks.today)
  }
}

struct QuoteWidget: Widget {
  let kind = "OnTrackQuote"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: QuoteProvider()) { entry in
      QuoteWidgetView(entry: entry)
    }
    .configurationDisplayName("Quote + ring")
    .description("A daily quote beside today's ring.")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}
