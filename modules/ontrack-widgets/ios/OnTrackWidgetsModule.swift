import ExpoModulesCore
import WidgetKit

// The app side of the widget bridge (see lib/widgets.ts): stores the JSON
// snapshot in the shared app group's UserDefaults, where the widget
// extension (targets/widgets/Snapshot.swift) reads it, and asks WidgetKit
// to redraw. A local Expo module so it links at the app's own deployment
// target; @bacons/apple-targets is only used for its config plugin.
public class OnTrackWidgetsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OnTrackWidgets")

    Function("setSnapshot") { (appGroup: String, key: String, json: String) -> Bool in
      guard let defaults = UserDefaults(suiteName: appGroup) else { return false }
      defaults.set(json, forKey: key)
      return true
    }

    Function("reloadWidgets") {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
