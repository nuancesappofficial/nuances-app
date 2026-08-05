import AppKit
import Foundation

private let canvasWidth = 1290
private let canvasHeight = 2796

private struct Slide {
    let output: String
    let source: String
    let title: String
    let subtitle: String
    let phoneTop: CGFloat
    let phoneWidth: CGFloat
    let cropX: CGFloat?
    let cropTop: CGFloat?
    let cropWidth: CGFloat?
    let cropHeight: CGFloat?
    let overlayTop: CGFloat?
    let overlayWidth: CGFloat?
}

private func topRect(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat) -> NSRect {
    NSRect(x: x, y: CGFloat(canvasHeight) - y - height, width: width, height: height)
}

private func font(_ size: CGFloat, weight: NSFont.Weight) -> NSFont {
    NSFont(name: weight == .bold ? "PingFangTC-Semibold" : "PingFangTC-Regular", size: size)
        ?? NSFont.systemFont(ofSize: size, weight: weight)
}

private func drawText(_ text: String, top: CGFloat, size: CGFloat, color: NSColor, weight: NSFont.Weight, lineHeight: CGFloat) {
    let style = NSMutableParagraphStyle()
    style.alignment = .center
    style.minimumLineHeight = lineHeight
    style.maximumLineHeight = lineHeight
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font(size, weight: weight),
        .foregroundColor: color,
        .paragraphStyle: style,
        .kern: 0.5,
    ]
    let string = NSAttributedString(string: text, attributes: attrs)
    let height = string.boundingRect(with: NSSize(width: 1140, height: 600), options: [.usesLineFragmentOrigin]).height + 8
    string.draw(with: topRect(75, top, 1140, height), options: [.usesLineFragmentOrigin, .usesFontLeading])
}

private func drawWave(fromLeft: Bool, top: CGFloat, color: NSColor, thickness: CGFloat, amplitude: CGFloat) {
    let path = NSBezierPath()
    let startX: CGFloat = fromLeft ? -90 : 1380
    let endX: CGFloat = fromLeft ? 510 : 780
    let y = CGFloat(canvasHeight) - top
    path.move(to: NSPoint(x: startX, y: y))
    path.curve(to: NSPoint(x: endX, y: y - amplitude * 0.25),
               controlPoint1: NSPoint(x: fromLeft ? 80 : 1210, y: y + amplitude),
               controlPoint2: NSPoint(x: fromLeft ? 310 : 980, y: y - amplitude))
    path.lineWidth = thickness
    path.lineCapStyle = .round
    color.setStroke()
    path.stroke()
}

private func drawRibbon(fromLeft: Bool, top: CGFloat, amplitude: CGFloat, reversed: Bool = false) {
    let colors: [NSColor] = reversed
        ? [NSColor(calibratedRed: 1.0, green: 0.22, blue: 0.16, alpha: 0.88), NSColor.white, NSColor(calibratedRed: 0.04, green: 0.70, blue: 0.83, alpha: 0.86), NSColor(calibratedRed: 0.11, green: 0.39, blue: 0.91, alpha: 0.78)]
        : [NSColor(calibratedRed: 0.11, green: 0.39, blue: 0.91, alpha: 0.82), NSColor.white, NSColor(calibratedRed: 0.03, green: 0.72, blue: 0.84, alpha: 0.88), NSColor(calibratedRed: 1.0, green: 0.24, blue: 0.17, alpha: 0.86)]
    let offsets: [CGFloat] = [-96, -35, 36, 126]
    let widths: [CGFloat] = [92, 28, 76, 112]
    for i in colors.indices {
        drawWave(fromLeft: fromLeft, top: top + offsets[i], color: colors[i], thickness: widths[i], amplitude: amplitude)
    }
}

private func drawBackground(index: Int) {
    let bounds = NSRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight)
    NSGradient(colors: [
        NSColor(calibratedRed: 0.985, green: 0.989, blue: 1.0, alpha: 1),
        NSColor(calibratedRed: 0.925, green: 0.944, blue: 0.985, alpha: 1),
    ])!.draw(in: bounds, angle: 90)

    let shift = CGFloat((index % 3) * 85)
    drawRibbon(fromLeft: index % 2 == 0, top: 760 + shift, amplitude: 190, reversed: index % 3 == 1)
    drawRibbon(fromLeft: index % 2 != 0, top: 1900 - shift, amplitude: 220, reversed: index % 3 != 1)
    drawRibbon(fromLeft: index % 2 == 0, top: 2360 - shift * 0.4, amplitude: 150, reversed: true)
}

private func drawRoundedImage(_ image: NSImage, in rect: NSRect, radius: CGFloat, shadow: Bool) {
    if shadow {
        NSGraphicsContext.saveGraphicsState()
        let s = NSShadow()
        s.shadowColor = NSColor.black.withAlphaComponent(0.28)
        s.shadowBlurRadius = 28
        s.shadowOffset = NSSize(width: 0, height: -12)
        s.set()
        NSColor.white.setFill()
        NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
        NSGraphicsContext.restoreGraphicsState()
    }
    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).addClip()
    image.draw(in: rect, from: .zero, operation: .copy, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
    NSGraphicsContext.restoreGraphicsState()
}

private func drawPhone(_ image: NSImage, top: CGFloat, width: CGFloat) -> NSRect {
    let ratio = image.size.height / image.size.width
    let screenHeight = width * ratio
    let bezel: CGFloat = 16
    let outer = topRect((CGFloat(canvasWidth) - width) / 2 - bezel, top - bezel, width + bezel * 2, screenHeight + bezel * 2)

    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.35)
    shadow.shadowBlurRadius = 32
    shadow.shadowOffset = NSSize(width: 0, height: -12)
    shadow.set()
    NSColor(calibratedWhite: 0.04, alpha: 1).setFill()
    NSBezierPath(roundedRect: outer, xRadius: 92, yRadius: 92).fill()
    NSGraphicsContext.restoreGraphicsState()

    let screen = topRect((CGFloat(canvasWidth) - width) / 2, top, width, screenHeight)
    drawRoundedImage(image, in: screen, radius: 76, shadow: false)
    NSColor(calibratedWhite: 0.8, alpha: 0.85).setStroke()
    let border = NSBezierPath(roundedRect: outer, xRadius: 92, yRadius: 92)
    border.lineWidth = 5
    border.stroke()
    return screen
}

private func croppedImage(_ image: NSImage, x: CGFloat, top: CGFloat, width: CGFloat, height: CGFloat) -> NSImage {
    let sourceHeight = image.size.height
    let sourceRect = NSRect(x: x, y: sourceHeight - top - height, width: width, height: height)
    let out = NSImage(size: sourceRect.size)
    out.lockFocus()
    image.draw(in: NSRect(origin: .zero, size: sourceRect.size), from: sourceRect, operation: .copy, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
    out.unlockFocus()
    return out
}

private func render(_ slide: Slide, index: Int, outputDirectory: URL) throws {
    guard let source = NSImage(contentsOfFile: slide.source) else {
        throw NSError(domain: "ScreenshotGenerator", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot load \(slide.source)"])
    }
    source.size = NSSize(width: 1206, height: 2622)
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: canvasWidth,
        pixelsHigh: canvasHeight,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else { throw NSError(domain: "ScreenshotGenerator", code: 2) }
    guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        throw NSError(domain: "ScreenshotGenerator", code: 3)
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    drawBackground(index: index)
    let titleSize: CGFloat = slide.title.split(separator: "\n").count == 1 ? 126 : 120
    drawText(slide.title, top: 105, size: titleSize, color: NSColor(calibratedRed: 0.035, green: 0.31, blue: 0.88, alpha: 1), weight: .bold, lineHeight: 138)
    let titleLines = slide.title.split(separator: "\n").count
    drawText(slide.subtitle, top: titleLines == 1 ? 300 : 390, size: 49, color: NSColor(calibratedRed: 0.025, green: 0.10, blue: 0.17, alpha: 1), weight: .bold, lineHeight: 62)
    _ = drawPhone(source, top: slide.phoneTop, width: slide.phoneWidth)

    if let cropX = slide.cropX, let cropTop = slide.cropTop,
       let cropWidth = slide.cropWidth, let cropHeight = slide.cropHeight,
       let overlayTop = slide.overlayTop, let overlayWidth = slide.overlayWidth {
        let crop = croppedImage(source, x: cropX, top: cropTop, width: cropWidth, height: cropHeight)
        let h = overlayWidth * crop.size.height / crop.size.width
        let rect = topRect((CGFloat(canvasWidth) - overlayWidth) / 2, overlayTop, overlayWidth, h)
        drawRoundedImage(crop, in: rect, radius: 42, shadow: true)
        NSColor.white.withAlphaComponent(0.72).setStroke()
        let line = NSBezierPath(roundedRect: rect, xRadius: 42, yRadius: 42)
        line.lineWidth = 4
        line.stroke()
    }
    NSGraphicsContext.restoreGraphicsState()

    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "ScreenshotGenerator", code: 4)
    }
    try data.write(to: outputDirectory.appendingPathComponent(slide.output), options: .atomic)
}

@main
struct TraditionalScreenshotGenerator {
    static func main() throws {
        let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let raw = root.appendingPathComponent("store-assets/app-store/screenshots/raw/02-Chinese-Traditional/iphone-6.9")
        let output = root.appendingPathComponent("store-assets/app-store/screenshots/final-traditional-chinese-v2")
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

        let slides = [
            Slide(output: "00-ios-share-sheet.png", source: raw.appendingPathComponent("00-ios-share-sheet/ios-share-sheet-dark.png").path, title: "不用開 App\n也能先存著", subtitle: "看到想學的英文，分享給 Nuances", phoneTop: 610, phoneWidth: 930, cropX: 24, cropTop: 140, cropWidth: 1158, cropHeight: 205, overlayTop: 810, overlayWidth: 1120),
            Slide(output: "01-upload.png", source: raw.appendingPathComponent("01-capture/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.32.07.png").path, title: "隨時上傳\n有空再學", subtitle: "圖片與文字先收著，想學時再處理", phoneTop: 610, phoneWidth: 930, cropX: 47, cropTop: 2160, cropWidth: 1112, cropHeight: 155, overlayTop: 1940, overlayWidth: 1120),
            Slide(output: "02-select-word.png", source: raw.appendingPathComponent("02-text-image-import/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.37.22.png").path, title: "一指選字", subtitle: "長按照片上的單字，立即選取", phoneTop: 590, phoneWidth: 930, cropX: 84, cropTop: 1230, cropWidth: 1028, cropHeight: 118, overlayTop: 1335, overlayWidth: 1100),
            Slide(output: "03-create-card.png", source: raw.appendingPathComponent("03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 16.57.20.png").path, title: "建立你的\n專屬字卡", subtitle: "把遇見的英文變成自己的學習內容", phoneTop: 610, phoneWidth: 930, cropX: 66, cropTop: 1045, cropWidth: 1075, cropHeight: 350, overlayTop: 1170, overlayWidth: 1080),
            Slide(output: "04-real-usage.png", source: raw.appendingPathComponent("03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 16.57.27.png").path, title: "學會最道地用法", subtitle: "搭配詞、語境與例句一次看懂", phoneTop: 560, phoneWidth: 930, cropX: 67, cropTop: 305, cropWidth: 1072, cropHeight: 505, overlayTop: 760, overlayWidth: 1080),
            Slide(output: "05-pronunciation.png", source: raw.appendingPathComponent("05-pronunciation-score/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.07.19.png").path, title: "測驗每個音的\n發音準確度", subtitle: "每個音都看得見，知道哪裡要調整", phoneTop: 610, phoneWidth: 930, cropX: 120, cropTop: 1310, cropWidth: 965, cropHeight: 235, overlayTop: 1260, overlayWidth: 1110),
            Slide(output: "06-quiz.png", source: raw.appendingPathComponent("04-quick-quiz-question/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.07.04.png").path, title: "用小挑戰複習\n自己的字卡", subtitle: "用自己的內容反覆練習", phoneTop: 610, phoneWidth: 930, cropX: 95, cropTop: 1770, cropWidth: 1015, cropHeight: 190, overlayTop: 1580, overlayWidth: 1090),
        ]

        for (index, slide) in slides.enumerated() {
            try render(slide, index: index, outputDirectory: output)
            print("rendered \(slide.output)")
        }
    }
}
