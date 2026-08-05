import Foundation

struct PixelSize {
    let width: Double
    let height: Double
}

struct PixelRect {
    let minX: Double
    let minY: Double
    let width: Double
    let height: Double
    var maxX: Double { minX + width }
    var maxY: Double { minY + height }
}

enum ScreenshotLayout {
    static func aspectFit(source: PixelSize, maxWidth: Double, maxHeight: Double) -> PixelSize {
        let scale = min(maxWidth / source.width, maxHeight / source.height)
        return PixelSize(width: source.width * scale, height: source.height * scale)
    }

    static func centeredRect(size: PixelSize, in canvas: PixelSize, centerY: Double) -> PixelRect {
        PixelRect(
            minX: (canvas.width - size.width) / 2,
            minY: centerY - size.height / 2,
            width: size.width,
            height: size.height
        )
    }
}
