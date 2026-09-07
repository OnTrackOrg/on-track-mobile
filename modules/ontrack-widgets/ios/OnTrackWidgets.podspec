Pod::Spec.new do |s|
  s.name           = 'OnTrackWidgets'
  s.version        = '1.0.0'
  s.summary        = 'App-group bridge between the OnTrack app and its WidgetKit extension'
  s.description    = 'Writes the widget snapshot into the shared app group and asks WidgetKit to reload.'
  s.author         = ''
  s.homepage       = 'https://github.com/OnTrackOrg/on-track-mobile'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
