import Foundation
import React

@objc(SharedDefaultsModule)
class SharedDefaultsModule: NSObject {
  private let appGroupID = "group.com.jeffenglishlearning.nuances.v2"
  private let sharedContentKey = "shared_content"
  private let activeUserIDKey = "active_user_id"
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
    _ expectedTimestamp: NSNumber,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    guard let defaults = UserDefaults(suiteName: appGroupID),
          let content = defaults.dictionary(forKey: sharedContentKey),
          let currentTimestamp = content["timestamp"] as? NSNumber else {
      resolve(false)
      return
    }

    guard currentTimestamp.doubleValue == expectedTimestamp.doubleValue else {
      resolve(false)
      return
    }

    defaults.removeObject(forKey: sharedContentKey)
    defaults.synchronize()
    resolve(true)
  }

  @objc(setActiveUserId:resolver:rejecter:)
  func setActiveUserId(
    _ userId: String?,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    guard let defaults = UserDefaults(suiteName: appGroupID) else {
      resolve(nil)
      return
    }

    if let normalized = userId?.trimmingCharacters(in: .whitespacesAndNewlines),
       !normalized.isEmpty {
      defaults.set(normalized, forKey: activeUserIDKey)
    } else {
      defaults.removeObject(forKey: activeUserIDKey)
    }
    defaults.synchronize()
    resolve(nil)
  }

  @objc(setUILanguage:resolver:rejecter:)
  func setUILanguage(
    _ language: String?,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    guard let defaults = UserDefaults(suiteName: appGroupID) else {
      resolve(nil)
      return
    }

    let normalized = language?.trimmingCharacters(in: .whitespacesAndNewlines)
    switch normalized {
    case "zh-TW", "zh-CN", "en":
      defaults.set(normalized, forKey: uiLanguageKey)
    default:
      defaults.set("en", forKey: uiLanguageKey)
    }
    defaults.synchronize()
    resolve(nil)
  }
}
