import AppKit
import Foundation

guard CommandLine.arguments.count == 4 else {
    throw NSError(domain: "Usage", code: 1, userInfo: [NSLocalizedDescriptionKey: "Usage: stitch_app_store_series.swift INPUT_DIR OUTPUT_PATH SEAM_DIR"])
}

let inputDirectory = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]
let seamDirectory = CommandLine.arguments[3]
let panelSize = NSSize(width: 1290, height: 2796)
let canvasSize = NSSize(width: panelSize.width * 7, height: panelSize.height)
let names = [
    "00-ios-share-sheet.png", "01-upload.png", "02-select-word.png",
    "03-create-card.png", "04-real-usage.png", "05-pronunciation.png", "06-quiz.png",
]

func load(_ path: String) throws -> NSImage {
    guard let image = NSImage(contentsOfFile: path) else {
        throw NSError(domain: "Image", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot load \(path)"])
    }
    return image
}

func bitmap(size: NSSize, draw: () -> Void) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(size.width),
        pixelsHigh: Int(size.height),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    draw()
    NSGraphicsContext.restoreGraphicsState()
    return rep
}

func save(_ rep: NSBitmapImageRep, to path: String) throws {
    guard let data = rep.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "Image", code: 3, userInfo: [NSLocalizedDescriptionKey: "Cannot encode PNG"])
    }
    try data.write(to: URL(fileURLWithPath: path))
}

let images = try names.map { try load("\(inputDirectory)/\($0)") }
let contact = bitmap(size: canvasSize) {
    NSColor.clear.setFill()
    NSRect(origin: .zero, size: canvasSize).fill()
    for (index, image) in images.enumerated() {
        image.draw(in: NSRect(x: CGFloat(index) * panelSize.width, y: 0, width: panelSize.width, height: panelSize.height))
    }
}

try FileManager.default.createDirectory(atPath: (outputPath as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
try FileManager.default.createDirectory(atPath: seamDirectory, withIntermediateDirectories: true)
try save(contact, to: outputPath)

let seamWidth: CGFloat = 320
let contactImage = NSImage(size: canvasSize)
contactImage.addRepresentation(contact)
for boundary in 1..<7 {
    let seam = bitmap(size: NSSize(width: seamWidth * 2, height: panelSize.height)) {
        let source = NSRect(x: CGFloat(boundary) * panelSize.width - seamWidth, y: 0, width: seamWidth * 2, height: panelSize.height)
        contactImage.draw(
            in: NSRect(x: 0, y: 0, width: seamWidth * 2, height: panelSize.height),
            from: source,
            operation: .copy,
            fraction: 1
        )
    }
    try save(seam, to: "\(seamDirectory)/seam-\(String(format: "%02d", boundary - 1))-\(String(format: "%02d", boundary)).png")
}

print("Created \(outputPath)")
