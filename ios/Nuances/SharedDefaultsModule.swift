import Foundation
import React

@objc(SharedDefaultsModule)
class SharedDefaultsModule: NSObject {
  private let appGroupID = "group.com.jeffenglishlearning.nuances.v2"
  private let sharedContentKey = "shared_content"
  private let uiLanguageKey = "nuances_ui_language"

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc(getSharedContent:rejecter:)
  func getSharedContent(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guard let defaults = UserDefaults(suiteName: appGroupID) else {
      resolve(nil)
      return
    }

    let value = defaults.object(forKey: sharedContentKey)
    resolve(value)
  }

  @objc(clearSharedContent:rejecter:)
  func clearSharedContent(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guard let defaults = UserDefaults(suiteName: appGroupID) else {
      resolve(nil)
      return
    }

    defaults.removeObject(forKey: sharedContentKey)
    defaults.synchronize()
    resolve(nil)
  }

  @objc(clearSharedContentIfTimestampMatches:resolver:rejecter:)
  func clearSharedContentIfTimestampMatches(
    timestamp: NSNumber,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    guard let defaults = UserDefaults(suiteName: appGroupID) else {
      resolve(false)
      return
    }

    guard let value = defaults.dictionary(forKey: sharedContentKey) else {
      resolve(true)
      return
    }

    let currentTimestamp = (value["timestamp"] as? NSNumber)?.doubleValue
      ?? value["timestamp"] as? Double
      ?? 0
    let expectedTimestamp = timestamp.doubleValue

    guard expectedTimestamp <= 0 || abs(currentTimestamp - expectedTimestamp) < 0.0001 else {
      resolve(false)
      return
    }

    defaults.removeObject(forKey: sharedContentKey)
    defaults.synchronize()
    resolve(true)
  }

  @objc(setUILanguage:resolver:rejecter:)
  func setUILanguage(language: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guard let defaults = UserDefaults(suiteName: appGroupID) else {
      resolve(nil)
      return
    }

    defaults.set(language as String, forKey: uiLanguageKey)
    defaults.synchronize()
    resolve(nil)
  }

}
