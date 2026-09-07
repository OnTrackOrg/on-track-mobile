import SwiftUI

// The app's palette math (contexts/ThemeContext.tsx + utils/color.ts), so a
// widget is tinted exactly like the app is for the same accent.

struct RGB {
  var r: Double
  var g: Double
  var b: Double

  init(r: Double, g: Double, b: Double) {
    self.r = r
    self.g = g
    self.b = b
  }

  /// Parses "#rrggbb" (case-insensitive). Falls back to mid grey.
  init(hex: String) {
    var value = hex.trimmingCharacters(in: .whitespaces)
    if value.hasPrefix("#") { value.removeFirst() }
    guard value.count == 6, let number = UInt32(value, radix: 16) else {
      self.init(r: 128, g: 128, b: 128)
      return
    }
    self.init(
      r: Double((number >> 16) & 0xff),
      g: Double((number >> 8) & 0xff),
      b: Double(number & 0xff)
    )
  }

  /// `color-mix(in srgb, self amount, base)`, like utils/color.ts `mix`.
  func mixed(_ amount: Double, into base: RGB) -> RGB {
    let t = min(1, max(0, amount))
    return RGB(
      r: r * t + base.r * (1 - t),
      g: g * t + base.g * (1 - t),
      b: b * t + base.b * (1 - t)
    )
  }

  var color: Color {
    Color(.sRGB, red: r / 255, green: g / 255, blue: b / 255, opacity: 1)
  }
}

func mix(_ hex: String, _ amount: Double, _ baseHex: String) -> Color {
  RGB(hex: hex).mixed(amount, into: RGB(hex: baseHex)).color
}

extension Color {
  init(hex: String) {
    self = RGB(hex: hex).color
  }
}

/// The subset of ThemeColors the widgets use, built the way the app builds it.
struct WidgetTheme {
  let accentHex: String
  let isDark: Bool

  let accent: Color
  let background: Color
  let surface: Color
  let border: Color
  let text: Color
  let textSecondary: Color
  let streak: Color
  /// Ring track behind the Today ring (TodayScreen).
  let ringTrack: Color
  /// Ring track behind a goal ring (GoalsScreen).
  let goalRingTrack: Color
  /// A strip cell with nothing done.
  let emptyCell: Color

  init(accentHex: String, isDark: Bool) {
    self.accentHex = accentHex
    self.isDark = isDark
    let accentRGB = RGB(hex: accentHex)
    let backgroundRGB = isDark
      ? accentRGB.mixed(0.09, into: RGB(hex: "#0c1017"))
      : accentRGB.mixed(0.06, into: RGB(hex: "#f4f5f8"))
    let surfaceRGB = isDark
      ? accentRGB.mixed(0.06, into: RGB(hex: "#171d28"))
      : accentRGB.mixed(0.02, into: RGB(hex: "#ffffff"))
    let secondaryHex = isDark ? "#9aa4b5" : "#6b7280"

    accent = accentRGB.color
    background = backgroundRGB.color
    surface = surfaceRGB.color
    border = isDark
      ? accentRGB.mixed(0.12, into: RGB(hex: "#2a3140")).color
      : accentRGB.mixed(0.08, into: RGB(hex: "#e5e7eb")).color
    text = Color(hex: isDark ? "#f5f7fa" : "#111827")
    textSecondary = Color(hex: secondaryHex)
    streak = Color(hex: isDark ? "#fb923c" : "#f97316")
    ringTrack = accentRGB.mixed(0.18, into: backgroundRGB).color
    goalRingTrack = accentRGB.mixed(0.15, into: backgroundRGB).color
    emptyCell = Color(hex: secondaryHex).opacity(0.14)
  }

  /// Strip cell colour for a day's completion ratio (GoalsScreen.renderStrip).
  func stripCell(ratio: Double, goalColor: String) -> Color {
    if ratio <= 0 { return emptyCell }
    let surfaceRGB = isDark
      ? RGB(hex: accentHex).mixed(0.06, into: RGB(hex: "#171d28"))
      : RGB(hex: accentHex).mixed(0.02, into: RGB(hex: "#ffffff"))
    return RGB(hex: goalColor).mixed(0.3 + ratio * 0.7, into: surfaceRGB).color
  }
}
