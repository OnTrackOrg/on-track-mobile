import SwiftUI
import WidgetKit

// 2a "Goals at a glance" (medium): every active goal as a ring in its own
// colour, the day total in the corner. Up to four rings; a fifth goal turns
// into a "+N" ring that opens the Goals tab. Never lists tasks.

struct GoalsGlanceEntry: TimelineEntry {
  let date: Date
  let day: WidgetDay
  let accent: String
}

struct GoalsGlanceProvider: TimelineProvider {
  func placeholder(in context: Context) -> GoalsGlanceEntry {
    GoalsGlanceEntry(date: Date(), day: SampleData.day, accent: SampleData.accent)
  }

  func getSnapshot(in context: Context, completion: @escaping (GoalsGlanceEntry) -> Void) {
    if context.isPreview {
      completion(placeholder(in: context))
      return
    }
    let now = Date()
    let snapshot = WidgetStore.load()
    completion(
      GoalsGlanceEntry(
        date: now,
        day: snapshot?.day(for: now) ?? SampleData.day,
        accent: snapshot?.accent ?? SampleData.accent
      ))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<GoalsGlanceEntry>) -> Void) {
    let now = Date()
    guard let snapshot = WidgetStore.load() else {
      completion(Timeline(entries: [placeholder(in: context)], policy: .never))
      return
    }
    let entries = WidgetStore.entryDates(for: snapshot, now: now).map { date, day in
      GoalsGlanceEntry(date: date, day: day, accent: snapshot.accent)
    }
    completion(Timeline(entries: entries.isEmpty ? [placeholder(in: context)] : entries, policy: .atEnd))
  }
}

struct GoalsGlanceView: View {
  let entry: GoalsGlanceEntry
  @Environment(\.colorScheme) private var colorScheme

  private static let maxRings = 4

  private var theme: WidgetTheme {
    WidgetTheme(accentHex: entry.accent, isDark: colorScheme == .dark)
  }

  var body: some View {
    let theme = theme
    let day = entry.day
    let goals = day.goals
    let overflow = goals.count > Self.maxRings
    let shown = overflow ? Array(goals.prefix(Self.maxRings - 1)) : goals
    let slots = shown.count + (overflow ? 1 : 0)
    let ringSize: CGFloat = slots >= 4 ? 52 : 56

    VStack(alignment: .leading, spacing: 0) {
      HStack {
        SectionLabel(text: "GOALS", theme: theme)
        Spacer()
        Text(day.total == 0 ? "Nothing due today" : "\(day.done) of \(day.total) done today")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(theme.textSecondary)
      }
      Spacer(minLength: 8)
      if goals.isEmpty {
        VStack(alignment: .leading, spacing: 2) {
          Text("No active goals")
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(theme.text)
          Text("Start one in OnTrack and it shows up here.")
            .font(.system(size: 12))
            .foregroundStyle(theme.textSecondary)
        }
        Spacer(minLength: 8)
      } else {
        HStack(alignment: .top, spacing: 8) {
          ForEach(shown) { goal in
            Link(destination: WidgetLinks.goal(goal.id)) {
              ringCell(goal: goal, size: ringSize, theme: theme)
            }
            .frame(maxWidth: .infinity)
          }
          if overflow {
            Link(destination: WidgetLinks.goals) {
              moreCell(count: goals.count - shown.count, size: ringSize, theme: theme)
            }
            .frame(maxWidth: .infinity)
          }
        }
      }
    }
    .padding(EdgeInsets(top: 16, leading: 18, bottom: 16, trailing: 18))
    .widgetSurface(theme)
    .widgetURL(WidgetLinks.goals)
  }

  private func ringCell(goal: WidgetGoal, size: CGFloat, theme: WidgetTheme) -> some View {
    VStack(spacing: 8) {
      RingView(
        percent: goal.percent, size: size, lineWidth: 6,
        color: Color(hex: goal.color), track: theme.goalRingTrack
      ) {
        Text("\(Int((goal.percent * 100).rounded()))%")
          .font(.system(size: 12, weight: .heavy))
          .foregroundStyle(theme.text)
      }
      Text(goal.title)
        .font(.system(size: 12, weight: .bold))
        .foregroundStyle(theme.text)
        .lineLimit(1)
        .truncationMode(.tail)
    }
  }

  private func moreCell(count: Int, size: CGFloat, theme: WidgetTheme) -> some View {
    VStack(spacing: 8) {
      ZStack {
        Circle().fill(theme.textSecondary.opacity(0.12))
        Text("+\(count)")
          .font(.system(size: 12, weight: .heavy))
          .foregroundStyle(theme.textSecondary)
      }
      .frame(width: size, height: size)
      Text("More")
        .font(.system(size: 11, weight: .bold))
        .foregroundStyle(theme.textSecondary)
    }
  }
}

struct GoalsGlanceWidget: Widget {
  let kind = "OnTrackGoals"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: GoalsGlanceProvider()) { entry in
      GoalsGlanceView(entry: entry)
    }
    .configurationDisplayName("Goals at a glance")
    .description("Every active goal as a ring, in its own colour.")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}
