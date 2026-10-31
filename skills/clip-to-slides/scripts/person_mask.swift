// 人物去背遮罩：輸出跟原圖同尺寸的 PNG，人物不透明、背景透明，給雜誌風模板把刊頭字壓在人物後面。
// usage: swift person_mask.swift <in.jpg> <out.png>
import CoreImage
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count == 3, let src = CIImage(contentsOf: URL(fileURLWithPath: args[1])) else {
    FileHandle.standardError.write("usage: swift person_mask.swift <in.jpg> <out.png>\n".data(using: .utf8)!)
    exit(1)
}

let req = VNGeneratePersonSegmentationRequest()
req.qualityLevel = .accurate
req.outputPixelFormat = kCVPixelFormatType_OneComponent8
try VNImageRequestHandler(ciImage: src).perform([req])
guard let buf = req.results?.first?.pixelBuffer else {
    FileHandle.standardError.write("no person found\n".data(using: .utf8)!)
    exit(2)
}

// 遮罩解析度較低：放大到原圖尺寸，再把亮度轉成透明度
var mask = CIImage(cvPixelBuffer: buf)
mask = mask.transformed(by: CGAffineTransform(scaleX: src.extent.width / mask.extent.width,
                                              y: src.extent.height / mask.extent.height))
let alpha = mask.applyingFilter("CIMaskToAlpha")
let ctx = CIContext()
try ctx.writePNGRepresentation(of: alpha, to: URL(fileURLWithPath: args[2]), format: .RGBA8,
                               colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
