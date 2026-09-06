import Foundation

// Mirror of lib/widgetSnapshot.ts. The app precomputes everything the widgets
// show (dues, progress, streaks, strips, quotes) for today and tomorrow and
// writes it as JSON into the shared app group; widgets only draw it.

struct WidgetQuote: Codable {
  let text: String
  let author: String
}

struct WidgetGoal: Codable, Identifiable {
  let id: String
  let title: String
  /// #rrggbb goal accent.
  let color: String
  /// 0...1 progress for the day.
  let percent: Double
  let subtitle: String
  let streak: Int
  /// Tasks still due that day.
  let pending: Int
  /// 14 daily ratios, oldest first.
  let strip: [Double]
}

struct WidgetDay: Codable {
  /// "yyyy-MM-dd" local calendar day.
  let dayKey: String
  let done: Int
  let total: Int
  let nextTask: String?
  let quote: WidgetQuote
  let goals: [WidgetGoal]
  /// Goal ids ranked "needs you most" first.
  let autoOrder: [String]

  var allDone: Bool { total > 0 && done == total }
  var left: Int { max(0, total - done) }
  var bestStreak: Int { goals.map(\.streak).max() ?? 0 }

  /// The goal the Auto picker resolves to: highest-ranked goal still present.
  var autoGoal: WidgetGoal? {
    for id in autoOrder {
      if let goal = goals.first(where: { $0.id == id }) { return goal }
    }
    return goals.first
  }

  func goal(withId id: String) -> WidgetGoal? {
    goals.first { $0.id == id }
  }
}

struct WidgetSnapshot: Codable {
  let version: Int
  /// The accent theme's colour, #rrggbb.
  let accent: String
  /// [today, tomorrow] at the time the app last wrote it.
  let days: [WidgetDay]

  /// The entry to show for a date: the matching day, else the newest one
  /// that is not in the future (a stale snapshot keeps showing its last day).
  func day(for date: Date) -> WidgetDay? {
    let key = WidgetSnapshot.dayKey(for: date)
    if let exact = days.first(where: { $0.dayKey == key }) { return exact }
    return days.last(where: { $0.dayKey < key }) ?? days.first
  }

  static let dayFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar.current
    formatter.timeZone = TimeZone.current
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
  }()

  static func dayKey(for date: Date) -> String {
    dayFormatter.string(from: date)
  }

  static func date(forDayKey key: String) -> Date? {
    dayFormatter.date(from: key)
  }
}

enum WidgetStore {
  // Mirrored in lib/widgets.ts.
  static let appGroup = "group.com.adamlincodesexpo.ontrack"
  static let snapshotKey = "widgetSnapshot"
  static let supportedVersion = 1

  static func load() -> WidgetSnapshot? {
    guard
      let json = UserDefaults(suiteName: appGroup)?.string(forKey: snapshotKey),
      let data = json.data(using: .utf8),
      let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
      snapshot.version == supportedVersion
    else { return nil }
    return snapshot
  }

  /// Timeline entries for a snapshot: one per day, dated now for today and
  /// local midnight for the following days, so widgets roll over without
  /// the app being opened.
  static func entryDates(for snapshot: WidgetSnapshot, now: Date = Date()) -> [(Date, WidgetDay)] {
    let calendar = Calendar.current
    var result: [(Date, WidgetDay)] = []
    for day in snapshot.days {
      guard let dayStart = WidgetSnapshot.date(forDayKey: day.dayKey) else { continue }
      let start = calendar.startOfDay(for: dayStart)
      result.append((start <= now ? now : start, day))
    }
    // Keep at most one entry that is already due (the latest), then the future ones.
    let due = result.filter { $0.0 <= now }
    let upcoming = result.filter { $0.0 > now }
    if let latestDue = due.last {
      return [latestDue] + upcoming
    }
    return upcoming.isEmpty ? [] : upcoming
  }
}

// Sample content for placeholders and the widget gallery (from the design).
enum SampleData {
  static let accent = "#3b82f6"

  static let goals: [WidgetGoal] = [
    WidgetGoal(
      id: "sample-run", title: "Run club", color: "#10b981", percent: 0.72,
      subtitle: "3 tasks · Due Dec 1, 2026", streak: 12, pending: 1,
      strip: [1, 0.5, 1, 1, 0, 0.5, 1, 1, 1, 1, 0, 1, 1, 0.5]
    ),
    WidgetGoal(
      id: "sample-read", title: "Read more", color: "#8b5cf6", percent: 0.4,
      subtitle: "2 tasks · Due Oct 15, 2026", streak: 4, pending: 1,
      strip: [1, 1, 0.5, 1, 0, 1, 0.5, 0, 1, 1, 0, 0.5, 1, 0]
    ),
    WidgetGoal(
      id: "sample-sleep", title: "Sleep better", color: "#f59e0b", percent: 0.58,
      subtitle: "1 task", streak: 2, pending: 0,
      strip: [0.5, 1, 1, 0, 1, 1, 0.5, 1, 0, 1, 1, 1, 0.5, 1]
    ),
  ]

  static let day = WidgetDay(
    dayKey: WidgetSnapshot.dayKey(for: Date()),
    done: 3, total: 5, nextTask: "Read 20 pages",
    quote: WidgetQuote(
      text: "Success is the sum of small efforts, repeated day in and day out.",
      author: "Robert Collier"
    ),
    goals: goals,
    autoOrder: goals.map(\.id)
  )

  static let snapshot = WidgetSnapshot(version: 1, accent: accent, days: [day])
}
