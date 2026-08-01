require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name          = 'VisionOCR'
  s.version       = package['version']
  s.summary       = 'Apple Vision OCR for Nuances'
  s.description   = 'A local Expo Module that exposes Apple Vision text recognition.'
  s.license       = { :type => 'Proprietary' }
  s.author        = { 'Nuances' => 'dev@localhost' }
  s.homepage      = 'https://example.local/vision-ocr'
  s.platforms     = { :ios => '15.1' }
  s.swift_version = '5.0'
  s.source        = { :path => '.' }
  s.static_framework = true

  s.source_files = '**/*.swift'
  s.frameworks = 'ImageIO', 'UIKit', 'Vision'
  s.dependency 'ExpoModulesCore'
end
