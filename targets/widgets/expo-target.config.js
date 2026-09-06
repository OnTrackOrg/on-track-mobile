// iOS home/lock-screen widget extension (@bacons/apple-targets). The Swift
// sources in this folder become the "widgets" target at `expo prebuild`
// time; the app feeds them through the shared app group (lib/widgets.ts).
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "widgets",
  displayName: "OnTrack",
  bundleIdentifier: ".widgets",
  // AppIntent-configured widgets (the goal picker) need iOS 17.
  deploymentTarget: "17.0",
  icon: "../../assets/icon.png",
  colors: {
    // Light/dark widget surfaces for the Ocean accent; the real surface is
    // painted at runtime from the snapshot's accent (Palette.swift).
    $widgetBackground: { light: "#fbfdff", dark: "#192334" },
    $accent: "#3b82f6",
  },
  images: {
    appIcon: {
      "1x": "./app-icon@1x.png",
      "2x": "./app-icon@2x.png",
      "3x": "./app-icon@3x.png",
    },
  },
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
