#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(VisionOCRModule, NSObject)

RCT_EXTERN_METHOD(recognizeText:(NSString *)imageUri
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
