import AppKit
import Foundation

struct CropError: Error, CustomStringConvertible {
    let description: String
}

func savePNG(_ image: CGImage, to url: URL) throws {
    let bitmap = NSBitmapImageRep(cgImage: image)
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        throw CropError(description: "Unable to encode PNG: \(url.path)")
    }
    try data.write(to: url)
}

guard CommandLine.arguments.count == 3 else {
    throw CropError(description: "Usage: crop_panorama.swift MASTER_PNG OUTPUT_DIR")
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
let panelsURL = outputURL.appendingPathComponent("panels", isDirectory: true)
let seamsURL = outputURL.appendingPathComponent("seam-checks", isDirectory: true)
let fileManager = FileManager.default
try fileManager.createDirectory(at: panelsURL, withIntermediateDirectories: true)
try fileManager.createDirectory(at: seamsURL, withIntermediateDirectories: true)

guard
    let source = NSImage(contentsOf: inputURL),
    let master = source.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
    throw CropError(description: "Unable to decode master panorama")
}

let panelWidth = 1290
let panelHeight = 2796
let panelCount = 7
guard master.width == panelWidth * panelCount, master.height == panelHeight else {
    throw CropError(description: "Expected 9030x2796 master, got \(master.width)x\(master.height)")
}

for index in 0..<panelCount {
    let rect = CGRect(x: index * panelWidth, y: 0, width: panelWidth, height: panelHeight)
    guard let crop = master.cropping(to: rect) else {
        throw CropError(description: "Unable to crop panel \(index)")
    }
    let name = String(format: "%02d-background.png", index)
    try savePNG(crop, to: panelsURL.appendingPathComponent(name))
}

let seamHalfWidth = 320
for boundary in 1..<panelCount {
    let rect = CGRect(
        x: boundary * panelWidth - seamHalfWidth,
        y: 0,
        width: seamHalfWidth * 2,
        height: panelHeight
    )
    guard let crop = master.cropping(to: rect) else {
        throw CropError(description: "Unable to crop seam \(boundary - 1)-\(boundary)")
    }
    let name = String(format: "%02d-%02d-seam.png", boundary - 1, boundary)
    try savePNG(crop, to: seamsURL.appendingPathComponent(name))
}

print("Created \(panelCount) panels and \(panelCount - 1) seam checks from \(master.width)x\(master.height) master")
