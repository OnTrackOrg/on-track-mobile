import AppIntents
import SwiftUI
import UIKit
import WidgetKit

// 1d "One goal" (medium): the Goals-tab card, pinned. The edit sheet's goal
// picker defaults to Auto (2b): whichever goal needs you most today, so the
// widget rotates only when you act. Stack several for the OS's own
// rotation (2c).

struct GoalEntity: AppEntity {
  static let autoId = "auto"
  static let auto = GoalEntity(id: autoId, title: "Auto · needs you most", color: nil)

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Goal"
  static var defaultQuery = GoalQuery()

  let id: String
  let title: String
  let color: String?

  var isAuto: Bool { id == GoalEntity.autoId }

  var displayRepresentation: DisplayRepresentation {
    if let color, let image = GoalEntity.dotImage(hex: color) {
      return DisplayRepresentation(title: "\(title)", image: .init(data: image))
    }
    return DisplayRepresentation(title: "\(title)")
  }

  init(id: String, title: String, color: String?) {
    self.id = id
    self.title = title
    self.color = color
  }

  init(goal: WidgetGoal) {
    self.init(id: goal.id, title: goal.title, color: goal.color)
  }

  /// A small dot in the goal's colour for the picker rows.
  private static func dotImage(hex: String) -> Data? {
    let size = CGSize(width: 20, height: 20)
    let renderer = UIGraphicsImageRenderer(size: size)
    let rgb = RGB(hex: hex)
    let image = renderer.image { context in
      UIColor(red: rgb.r / 255, green: rgb.g / 255, blue: rgb.b / 255, alpha: 1).setFill()
      context.cgContext.fillEllipse(in: CGRect(x: 5, y: 5, width: 10, height: 10))
    }
    return image.pngData()
  }
}

struct GoalQuery: EntityQuery {
  private func available() -> [GoalEntity] {
    let goals = WidgetStore.load()?.days.first?.goals ?? []
    return [GoalEntity.auto] + goals.map(GoalEntity.init(goal:))
  }

  func entities(for identifiers: [String]) async throws -> [GoalEntity] {
    let all = available()
    return identifiers.compactMap { id in all.first { $0.id == id } }
  }

  func suggestedEntities() async throws -> [GoalEntity] {
    available()
  }

  func defaultResult() async -> GoalEntity? {
    GoalEntity.auto
  }
}

struct SelectGoalIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Choose a goal"
  static var description = IntentDescription(
    "Pin one goal, or let Auto show whichever goal needs you most today.")

  @Parameter(title: "Goal")
  var goal: GoalEntity?

  init() {}

  init(goal: GoalEntity?) {
    self.goal = goal
  }
}

struct GoalEntry: TimelineEntry {
  let date: Date
  let day: WidgetDay
  let accent: String
  let goal: WidgetGoal?
  let isAuto: Bool

  init(date: Date, day: WidgetDay, accent: String, selection: GoalEntity?) {
    self.date = date
    self.day = day
    self.accent = accent
    if let selection, !selection.isAuto, let pinned = day.goal(withId: selection.id) {
      goal = pinned
      isAuto = false
    } else {
      // Auto, or a pinned goal that is no longer active.
      goal = day.autoGoal
      isAuto = true
    }
  }
}

struct GoalProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> GoalEntry {
    GoalEntry(date: Date(), day: SampleData.day, accent: SampleData.accent, selection: nil)
  }

  func snapshot(for configuration: SelectGoalIntent, in context: Context) async -> GoalEntry {
    if context.isPreview { return placeholder(in: context) }
    let now = Date()
    let snapshot = WidgetStore.load()
    return GoalEntry(
      date: now,
      day: snapshot?.day(for: now) ?? SampleData.day,
      accent: snapshot?.accent ?? SampleData.accent,
      selection: configuration.goal
    )
  }

  func timeline(for configuration: SelectGoalIntent, in context: Context) async -> Timeline<GoalEntry> {
    let now = Date()
    guard let snapshot = WidgetStore.load() else {
      return Timeline(entries: [placeholder(in: context)], policy: .never)
    }
    let entries = WidgetStore.entryDates(for: snapshot, now: now).map { date, day in
      GoalEntry(date: date, day: day, accent: snapshot.accent, selection: configuration.goal)
    }
    return Timeline(entries: entries.isEmpty ? [placeholder(in: context)] : entries, policy: .atEnd)
  }
}

struct GoalWidgetView: View {
  let entry: GoalEntry
  @Environment(\.colorScheme) private var colorScheme

  private var theme: WidgetTheme {
    WidgetTheme(accentHex: entry.accent, isDark: colorScheme == .dark)
  }

  var body: some View {
    let theme = theme
    Group {
      if let goal = entry.goal {
        card(goal: goal, theme: theme)
          .widgetURL(WidgetLinks.goal(goal.id))
      } else {
        empty(theme: theme)
          .widgetURL(WidgetLinks.goals)
      }
    }
    .widgetSurface(theme)
  }

  private func card(goal: WidgetGoal, theme: WidgetTheme) -> some View {
    let goalColor = Color(hex: goal.color)
    return ZStack(alignment: .topLeading) {
      GoalEdge(color: goalColor)
        .padding(.leading, 11)
        .padding(.vertical, 18)

      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 12) {
          RingView(
            percent: goal.percent, size: 52, lineWidth: 6,
            color: goalColor, track: theme.goalRingTrack
          ) {
            Text("\(Int((goal.percent * 100).rounded()))%")
              .font(.system(size: 12, weight: .bold))
              .foregroundStyle(theme.text)
          }
          VStack(alignment: .leading, spacing: 2) {
            Text(goal.title)
              .font(.system(size: 17, weight: .bold))
              .foregroundStyle(theme.text)
            Text(goal.subtitle)
              .font(.system(size: 12))
              .foregroundStyle(theme.textSecondary)
          }
          .lineLimit(1)
          Spacer(minLength: 0)
          if !entry.isAuto, goal.streak > 0 {
            StreakPill(streak: goal.streak, color: theme.streak)
          }
        }
        Spacer(minLength: 8)
        StripView(values: goal.strip, goalColor: goal.color, theme: theme)
      }
      .padding(EdgeInsets(top: 18, leading: 26, bottom: 18, trailing: 18))
    }
    .overlay(alignment: .topTrailing) {
      if entry.isAuto {
        NeedsYouPill(accent: theme.accent)
          .padding(.top, 14)
          .padding(.trailing, 18)
      }
    }
  }

  private func empty(theme: WidgetTheme) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      SectionLabel(text: "GOAL", theme: theme)
      Spacer()
      Text("No active goals")
        .font(.system(size: 17, weight: .bold))
        .foregroundStyle(theme.text)
      Text("Start one in OnTrack and it shows up here.")
        .font(.system(size: 12))
        .foregroundStyle(theme.textSecondary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .padding(EdgeInsets(top: 16, leading: 18, bottom: 18, trailing: 18))
  }
}

struct GoalWidget: Widget {
  let kind = "OnTrackGoal"

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: kind, intent: SelectGoalIntent.self, provider: GoalProvider()) { entry in
      GoalWidgetView(entry: entry)
    }
    .configurationDisplayName("One goal")
    .description("Ring, streak and last 14 days for a goal you choose, or the one that needs you most.")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}
