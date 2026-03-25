require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'LiquidTabBar'
  s.version      = package['version']
  s.summary      = 'iOS liquid glass tab bar for Expo/React Native'
  s.description  = 'A local Expo Module that exposes a SwiftUI liquid tab bar.'
  s.license      = { :type => 'Proprietary' }
  s.author       = { 'Nuances' => 'dev@localhost' }
  s.homepage     = 'https://example.local/liquid-tab-bar'
  s.platforms    = { :ios => '15.1' }
  s.swift_version = '5.0'
  s.source       = { :path => '.' }
  s.static_framework = true

  s.source_files = '**/*.{swift,h,m,mm}'
  s.dependency 'ExpoModulesCore'
end
