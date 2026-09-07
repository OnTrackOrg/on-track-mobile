import SwiftUI
import WidgetKit

// Shapes lifted from the app so the widgets read as OnTrack: the progress
// ring, streak pill, goal colour edge and the 14-day strip.

struct RingView<Label: View>: View {
  let percent: Double
  let size: CGFloat
  let lineWidth: CGFloat
  let color: Color
  let track: Color
  @ViewBuilder let label: () -> Label

  var body: some View {
    ZStack {
      Circle()
        .stroke(track, lineWidth: lineWidth)
      Circle()
        .trim(from: 0, to: min(1, max(0, percent)))
        .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        .rotationEffect(.degrees(-90))
      label()
    }
    .frame(width: size, height: size)
  }
}

struct StreakPill: View {
  let streak: Int
  let color: Color

  var body: some View {
    HStack(spacing: 2) {
      Image(systemName: "bolt.fill")
        .font(.system(size: 11, weight: .bold))
      Text("\(streak)")
        .font(.system(size: 12, weight: .heavy))
    }
    .foregroundStyle(color)
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .background(color.opacity(0.12), in: Capsule())
  }
}

struct NeedsYouPill: View {
  let accent: Color

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: "sparkles")
        .font(.system(size: 9, weight: .bold))
      Text("NEEDS YOU")
        .font(.system(size: 10, weight: .bold))
        .tracking(0.4)
    }
    .foregroundStyle(accent)
    .padding(.horizontal, 8)
    .padding(.vertical, 3)
    .background(accent.opacity(0.1), in: Capsule())
  }
}

struct TrophyChip: View {
  let accent: Color

  var body: some View {
    ZStack {
      Circle().fill(accent.opacity(0.15))
      Image(systemName: "trophy.fill")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(accent)
    }
    .frame(width: 22, height: 22)
  }
}

struct GoalEdge: View {
  let color: Color

  var body: some View {
    RoundedRectangle(cornerRadius: 2)
      .fill(color)
      .frame(width: 3)
  }
}

struct StripView: View {
  let values: [Double]
  let goalColor: String
  let theme: WidgetTheme

  var body: some View {
    HStack(spacing: 8) {
      HStack(spacing: 3) {
        ForEach(Array(values.suffix(14).enumerated()), id: \.offset) { _, ratio in
          RoundedRectangle(cornerRadius: 4)
            .fill(theme.stripCell(ratio: ratio, goalColor: goalColor))
            .frame(height: 14)
            .frame(maxWidth: .infinity)
        }
      }
      Text("LAST 14 DAYS")
        .font(.system(size: 10, weight: .semibold))
        .tracking(0.4)
        .foregroundStyle(theme.textSecondary)
        .fixedSize()
    }
  }
}

struct AppIconMark: View {
  var body: some View {
    Image("appIcon")
      .resizable()
      .frame(width: 16, height: 16)
      .clipShape(RoundedRectangle(cornerRadius: 4))
  }
}

struct SectionLabel: View {
  let text: String
  let theme: WidgetTheme

  var body: some View {
    Text(text)
      .font(.system(size: 11, weight: .bold))
      .tracking(0.6)
      .foregroundStyle(theme.textSecondary)
  }
}

/// The widget surface: the app's card colour for the accent, with the app's
/// hairline border in dark mode (the design's dark widgets carry it).
struct WidgetSurface: View {
  let theme: WidgetTheme

  var body: some View {
    ZStack {
      theme.surface
      if theme.isDark {
        ContainerRelativeShape()
          .strokeBorder(theme.border, lineWidth: 1)
      }
    }
  }
}

extension View {
  func widgetSurface(_ theme: WidgetTheme) -> some View {
    containerBackground(for: .widget) { WidgetSurface(theme: theme) }
  }
}

enum WidgetLinks {
  static let today = URL(string: "ontrack://today")!
  static let goals = URL(string: "ontrack://goals")!

  static func goal(_ id: String) -> URL {
    let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
    return URL(string: "ontrack://goal/\(encoded)") ?? goals
  }
}
