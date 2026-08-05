import AppKit
import Foundation

struct CompositionError: Error, CustomStringConvertible {
    let description: String
}

struct Panel00Layout {
    static let canvas = CGSize(width: 1290, height: 2796)
    static let phone = CGRect(x: 175, y: 770, width: 940, height: 1964)
    static let screenInset: CGFloat = 30
    static let highlight = CGRect(x: 80, y: 927, width: 1130, height: 196)
    static let sourceNotificationTopRect = CGRect(x: 18, y: 123, width: 815, height: 141)
}

func topRect(_ rect: CGRect) -> CGRect {
    CGRect(
        x: rect.origin.x,
        y: Panel00Layout.canvas.height - rect.origin.y - rect.height,
        width: rect.width,
        height: rect.height
    )
}

func loadImage(_ path: String) throws -> NSImage {
    guard let image = NSImage(contentsOfFile: path) else {
        throw CompositionError(description: "Unable to load image: \(path)")
    }
    return image
}

func roundedPath(_ rect: CGRect, radius: CGFloat) -> NSBezierPath {
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
}

func drawShadowedPath(_ path: NSBezierPath, color: NSColor, blur: CGFloat, offset: CGSize) {
    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = color
    shadow.shadowBlurRadius = blur
    shadow.shadowOffset = offset
    shadow.set()
    NSColor.black.setFill()
    path.fill()
    NSGraphicsContext.restoreGraphicsState()
}

func drawPhone(background: NSImage, source: NSImage) {
    background.draw(in: CGRect(origin: .zero, size: Panel00Layout.canvas))

    let phoneRect = topRect(Panel00Layout.phone)
    drawShadowedPath(
        roundedPath(phoneRect, radius: 126),
        color: NSColor.black.withAlphaComponent(0.24),
        blur: 34,
        offset: CGSize(width: 0, height: -14)
    )

    let bodyPath = roundedPath(phoneRect, radius: 126)
    NSColor(calibratedWhite: 0.075, alpha: 1).setFill()
    bodyPath.fill()
    NSColor(calibratedWhite: 0.52, alpha: 1).setStroke()
    bodyPath.lineWidth = 7
    bodyPath.stroke()

    let screenRect = phoneRect.insetBy(dx: Panel00Layout.screenInset, dy: Panel00Layout.screenInset)
    let screenPath = roundedPath(screenRect, radius: 102)
    NSGraphicsContext.saveGraphicsState()
    screenPath.addClip()
    source.draw(in: screenRect, from: .zero, operation: .copy, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()

    NSColor.black.withAlphaComponent(0.55).setStroke()
    screenPath.lineWidth = 3
    screenPath.stroke()
}

func drawHighlight(source: NSImage) {
    let targetRect = topRect(Panel00Layout.highlight)
    let targetPath = roundedPath(targetRect, radius: 64)
    drawShadowedPath(
        targetPath,
        color: NSColor.black.withAlphaComponent(0.34),
        blur: 30,
        offset: CGSize(width: 0, height: -12)
    )

    let sourceSize = source.size
    let topSource = Panel00Layout.sourceNotificationTopRect
    let sourceRect = CGRect(
        x: topSource.minX,
        y: sourceSize.height - topSource.maxY,
        width: topSource.width,
        height: topSource.height
    )

    NSGraphicsContext.saveGraphicsState()
    targetPath.addClip()
    source.draw(in: targetRect, from: sourceRect, operation: .copy, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()

    NSColor.white.withAlphaComponent(0.18).setStroke()
    targetPath.lineWidth = 2
    targetPath.stroke()
}

func drawCenteredText(
    _ text: String,
    top: CGFloat,
    width: CGFloat,
    height: CGFloat,
    font: NSFont,
    color: NSColor,
    lineSpacing: CGFloat = 0
) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    paragraph.lineBreakMode = .byWordWrapping
    paragraph.minimumLineHeight = font.pointSize + lineSpacing
    paragraph.maximumLineHeight = font.pointSize + lineSpacing

    let attributed = NSAttributedString(
        string: text,
        attributes: [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: paragraph,
        ]
    )
    let rect = topRect(CGRect(x: (Panel00Layout.canvas.width - width) / 2, y: top, width: width, height: height))
    attributed.draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading])
}

func makeCanvas(draw: () -> Void) -> NSBitmapImageRep {
    let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(Panel00Layout.canvas.width),
        pixelsHigh: Int(Panel00Layout.canvas.height),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    NSGraphicsContext.current?.imageInterpolation = .high
    draw()
    NSGraphicsContext.restoreGraphicsState()
    return bitmap
}

func save(_ bitmap: NSBitmapImageRep, to path: String) throws {
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        throw CompositionError(description: "Unable to encode PNG")
    }
    try data.write(to: URL(fileURLWithPath: path))
}

guard CommandLine.arguments.count == 5 else {
    throw CompositionError(
        description: "Usage: compose_app_store_panel.swift BACKGROUND SOURCE_SCREENSHOT LAYERS_DIR FINAL_PNG"
    )
}

let background = try loadImage(CommandLine.arguments[1])
let source = try loadImage(CommandLine.arguments[2])
let layersDirectory = CommandLine.arguments[3]
let finalPath = CommandLine.arguments[4]
try FileManager.default.createDirectory(
    at: URL(fileURLWithPath: layersDirectory, isDirectory: true),
    withIntermediateDirectories: true
)
try FileManager.default.createDirectory(
    at: URL(fileURLWithPath: finalPath).deletingLastPathComponent(),
    withIntermediateDirectories: true
)

let stage1 = makeCanvas {
    background.draw(in: CGRect(origin: .zero, size: Panel00Layout.canvas))
}
try save(stage1, to: "\(layersDirectory)/01-background.png")

let stage2 = makeCanvas {
    drawPhone(background: background, source: source)
}
try save(stage2, to: "\(layersDirectory)/02-phone.png")

let stage3 = makeCanvas {
    drawPhone(background: background, source: source)
    drawHighlight(source: source)
}
try save(stage3, to: "\(layersDirectory)/03-highlight.png")

let stage4 = makeCanvas {
    drawPhone(background: background, source: source)
    drawHighlight(source: source)
    drawCenteredText(
        "不用開 App\n也能先存著",
        top: 190,
        width: 1180,
        height: 320,
        font: NSFont(name: "STYuanti-TC-Bold", size: 144) ?? .boldSystemFont(ofSize: 144),
        color: NSColor(srgbRed: 0.05, green: 0.34, blue: 0.88, alpha: 1),
        lineSpacing: 5
    )
    drawCenteredText(
        "看到想學的英文，分享給 Nuances",
        top: 545,
        width: 1160,
        height: 96,
        font: NSFont(name: "STYuanti-TC-Bold", size: 58) ?? .systemFont(ofSize: 58, weight: .bold),
        color: NSColor(srgbRed: 0.04, green: 0.10, blue: 0.17, alpha: 1)
    )
}
try save(stage4, to: "\(layersDirectory)/04-text.png")
try save(stage4, to: finalPath)

print("Created panel 00 layers and final PNG at 1290x2796")
