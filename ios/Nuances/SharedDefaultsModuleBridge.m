#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SharedDefaultsModule, NSObject)

RCT_EXTERN_METHOD(getSharedContent:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(clearSharedContent:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(clearSharedContentIfTimestampMatches:(nonnull NSNumber *)timestamp resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setUILanguage:(NSString *)language resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end
