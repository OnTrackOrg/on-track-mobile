import SwiftUI
import WidgetKit

@main
struct OnTrackWidgetBundle: WidgetBundle {
  var body: some Widget {
    TodayWidget()
    GoalWidget()
    GoalsGlanceWidget()
    QuoteWidget()
  }
}
