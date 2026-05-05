import Foundation
import React

@objc(SharedDefaultsModule)
class SharedDefaultsModule: NSObject {
  private let appGroupID = "group.com.jeffenglishlearning.nuances"
  private let sharedContentKey = "shared_content"

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
}
