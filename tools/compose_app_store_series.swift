import AppKit
import Foundation

struct SeriesError: Error, CustomStringConvertible {
    let description: String
}

struct PanelConfig {
    let index: Int
    let slug: String
    let title: String
    let subtitle: String
    let sourcePath: String
    let highlightSourcePath: String
    let highlightSourceTopRect: CGRect
    let highlightTop: CGFloat
    let highlightHeight: CGFloat
    let titleTop: CGFloat
    let subtitleTop: CGFloat
}

let canvas = CGSize(width: 1290, height: 2796)
let phoneTopRect = CGRect(x: 175, y: 770, width: 940, height: 1964)
let screenInset: CGFloat = 30
let highlightLeft: CGFloat = 80
let highlightWidth: CGFloat = 1130

func topRect(_ rect: CGRect) -> CGRect {
    CGRect(x: rect.minX, y: canvas.height - rect.maxY, width: rect.width, height: rect.height)
}

func load(_ path: String) throws -> NSImage {
    guard let image = NSImage(contentsOfFile: path) else {
        throw SeriesError(description: "Unable to load image: \(path)")
    }
    return image
}

func rounded(_ rect: CGRect, _ radius: CGFloat) -> NSBezierPath {
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
}

func shadow(_ path: NSBezierPath, blur: CGFloat, offset: CGSize, alpha: CGFloat) {
    NSGraphicsContext.saveGraphicsState()
    let value = NSShadow()
    value.shadowColor = NSColor.black.withAlphaComponent(alpha)
    value.shadowBlurRadius = blur
    value.shadowOffset = offset
    value.set()
    NSColor.black.setFill()
    path.fill()
    NSGraphicsContext.restoreGraphicsState()
}

func drawPhone(background: NSImage, source: NSImage) {
    background.draw(in: CGRect(origin: .zero, size: canvas))
    let phone = topRect(phoneTopRect)
    let body = rounded(phone, 126)
    shadow(body, blur: 34, offset: CGSize(width: 0, height: -14), alpha: 0.24)
    NSColor(calibratedWhite: 0.075, alpha: 1).setFill()
    body.fill()
    NSColor(calibratedWhite: 0.52, alpha: 1).setStroke()
    body.lineWidth = 7
    body.stroke()

    let container = phone.insetBy(dx: screenInset, dy: screenInset)
    let sourceRatio = source.size.width / source.size.height
    let containerRatio = container.width / container.height
    let fitted: CGRect
    if sourceRatio > containerRatio {
        let height = container.width / sourceRatio
        fitted = CGRect(x: container.minX, y: container.midY - height / 2, width: container.width, height: height)
    } else {
        let width = container.height * sourceRatio
        fitted = CGRect(x: container.midX - width / 2, y: container.minY, width: width, height: container.height)
    }

    let screen = rounded(container, 102)
    NSGraphicsContext.saveGraphicsState()
    screen.addClip()
    NSColor.black.setFill()
    container.fill()
    source.draw(in: fitted, from: .zero, operation: .copy, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()
    NSColor.black.withAlphaComponent(0.55).setStroke()
    screen.lineWidth = 3
    screen.stroke()
}

func drawHighlight(source: NSImage, sourceTopRect: CGRect, top: CGFloat, height: CGFloat) {
    let target = topRect(CGRect(x: highlightLeft, y: top, width: highlightWidth, height: height))
    let path = rounded(target, min(64, height * 0.28))
    shadow(path, blur: 30, offset: CGSize(width: 0, height: -12), alpha: 0.34)
    let sourceRect = CGRect(
        x: sourceTopRect.minX,
        y: source.size.height - sourceTopRect.maxY,
        width: sourceTopRect.width,
        height: sourceTopRect.height
    )
    NSGraphicsContext.saveGraphicsState()
    path.addClip()
    source.draw(in: target, from: sourceRect, operation: .copy, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()
    NSColor.white.withAlphaComponent(0.22).setStroke()
    path.lineWidth = 2
    path.stroke()
}

func drawText(_ value: String, top: CGFloat, size: CGFloat, width: CGFloat, height: CGFloat, color: NSColor) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    paragraph.lineBreakMode = .byWordWrapping
    paragraph.minimumLineHeight = size + 5
    paragraph.maximumLineHeight = size + 5
    let font = NSFont(name: "STYuanti-TC-Bold", size: size) ?? .boldSystemFont(ofSize: size)
    let text = NSAttributedString(
        string: value,
        attributes: [.font: font, .foregroundColor: color, .paragraphStyle: paragraph]
    )
    text.draw(
        with: topRect(CGRect(x: (canvas.width - width) / 2, y: top, width: width, height: height)),
        options: [.usesLineFragmentOrigin, .usesFontLeading]
    )
}

func bitmap(_ draw: () -> Void) -> NSBitmapImageRep {
    let result = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(canvas.width),
        pixelsHigh: Int(canvas.height),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: result)
    NSGraphicsContext.current?.imageInterpolation = .high
    draw()
    NSGraphicsContext.restoreGraphicsState()
    return result
}

func save(_ image: NSBitmapImageRep, _ path: String) throws {
    guard let data = image.representation(using: .png, properties: [:]) else {
        throw SeriesError(description: "Unable to encode PNG: \(path)")
    }
    try data.write(to: URL(fileURLWithPath: path))
}

guard CommandLine.arguments.count == 3 else {
    throw SeriesError(description: "Usage: compose_app_store_series.swift PROJECT_ROOT OUTPUT_LANGUAGE_DIR")
}

let root = CommandLine.arguments[1]
let outputLanguage = CommandLine.arguments[2]
let raw = "\(root)/store-assets/app-store/screenshots/raw/02-Chinese-Traditional/iphone-6.9"
let reference = "\(root)/store-assets/app-store/screenshots/final-traditional-chinese"
let configs = [
    PanelConfig(index: 1, slug: "upload", title: "隨時上傳\n有空再學", subtitle: "圖片與文字先收著，想學時再處理", sourcePath: "\(raw)/01-capture/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.32.07.png", highlightSourcePath: "\(raw)/01-capture/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.32.07.png", highlightSourceTopRect: CGRect(x: 48, y: 2178, width: 1110, height: 165), highlightTop: 2383, highlightHeight: 180, titleTop: 190, subtitleTop: 545),
    PanelConfig(index: 2, slug: "select-word", title: "一指選字", subtitle: "長按照片上的單字，立即選取", sourcePath: "\(raw)/02-text-image-import/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.37.22.png", highlightSourcePath: "\(raw)/02-text-image-import/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 14.37.22.png", highlightSourceTopRect: CGRect(x: 76, y: 1220, width: 1054, height: 118), highlightTop: 1686, highlightHeight: 170, titleTop: 260, subtitleTop: 465),
    PanelConfig(index: 3, slug: "create-card", title: "建立你的\n專屬字卡", subtitle: "把遇見的英文變成自己的學習內容", sourcePath: "\(raw)/03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 16.57.20.png", highlightSourcePath: "\(raw)/03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 16.57.20.png", highlightSourceTopRect: CGRect(x: 95, y: 1135, width: 1015, height: 270), highlightTop: 1624, highlightHeight: 300, titleTop: 190, subtitleTop: 545),
    PanelConfig(index: 4, slug: "real-usage", title: "學會最道地用法", subtitle: "搭配詞、語境與例句一次看懂", sourcePath: "\(raw)/03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 16.57.27.png", highlightSourcePath: "\(raw)/03-real-context/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 16.57.27.png", highlightSourceTopRect: CGRect(x: 90, y: 450, width: 1025, height: 390), highlightTop: 1127, highlightHeight: 430, titleTop: 260, subtitleTop: 465),
    PanelConfig(index: 5, slug: "pronunciation", title: "測驗每個音的\n發音準確度", subtitle: "每個音都看得見，知道哪裡要調整", sourcePath: "\(raw)/05-pronunciation-score/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.07.19.png", highlightSourcePath: "\(raw)/05-pronunciation-score/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.07.19.png", highlightSourceTopRect: CGRect(x: 108, y: 1300, width: 990, height: 260), highlightTop: 1744, highlightHeight: 290, titleTop: 190, subtitleTop: 545),
    PanelConfig(index: 6, slug: "quiz", title: "用小挑戰複習\n自己的字卡", subtitle: "用自己的內容反覆練習", sourcePath: "\(raw)/04-quick-quiz-question/Simulator Screenshot - iPhone 17 Pro - 2026-07-23 at 20.07.04.png", highlightSourcePath: "\(reference)/06-quiz.png", highlightSourceTopRect: CGRect(x: 120, y: 1945, width: 1050, height: 190), highlightTop: 2140, highlightHeight: 220, titleTop: 190, subtitleTop: 545),
]

let fm = FileManager.default
let blue = NSColor(srgbRed: 0.05, green: 0.34, blue: 0.88, alpha: 1)
let dark = NSColor(srgbRed: 0.04, green: 0.10, blue: 0.17, alpha: 1)

for config in configs {
    let backgroundPath = "\(root)/store-assets/app-store/screenshots/working/02-Chinese-Traditional/panorama-background/panels/\(String(format: "%02d", config.index))-background.png"
    let layers = "\(root)/store-assets/app-store/screenshots/working/02-Chinese-Traditional/layers/\(String(format: "%02d", config.index))-\(config.slug)"
    try fm.createDirectory(atPath: layers, withIntermediateDirectories: true)
    try fm.createDirectory(atPath: outputLanguage, withIntermediateDirectories: true)
    let background = try load(backgroundPath)
    let source = try load(config.sourcePath)
    let highlight = try load(config.highlightSourcePath)

    let stage1 = bitmap { background.draw(in: CGRect(origin: .zero, size: canvas)) }
    try save(stage1, "\(layers)/01-background.png")
    let stage2 = bitmap { drawPhone(background: background, source: source) }
    try save(stage2, "\(layers)/02-phone.png")
    let stage3 = bitmap {
        drawPhone(background: background, source: source)
        drawHighlight(source: highlight, sourceTopRect: config.highlightSourceTopRect, top: config.highlightTop, height: config.highlightHeight)
    }
    try save(stage3, "\(layers)/03-highlight.png")
    let stage4 = bitmap {
        drawPhone(background: background, source: source)
        drawHighlight(source: highlight, sourceTopRect: config.highlightSourceTopRect, top: config.highlightTop, height: config.highlightHeight)
        let titleSize: CGFloat = config.title.contains("\n") ? 144 : 150
        drawText(config.title, top: config.titleTop, size: titleSize, width: 1180, height: config.title.contains("\n") ? 320 : 180, color: blue)
        drawText(config.subtitle, top: config.subtitleTop, size: 58, width: 1160, height: 96, color: dark)
    }
    try save(stage4, "\(layers)/04-text.png")
    try save(stage4, "\(outputLanguage)/\(String(format: "%02d", config.index))-\(config.slug).png")
    print("Created panel \(config.index): \(config.slug)")
}
