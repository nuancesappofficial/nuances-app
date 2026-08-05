import Foundation

@main
struct TraditionalScreenshotLayoutTests {
    static func main() {
        let source = PixelSize(width: 1206, height: 2622)
        let fitted = ScreenshotLayout.aspectFit(source: source, maxWidth: 930, maxHeight: 2022)

        precondition(fitted.width <= 930.001)
        precondition(fitted.height <= 2022.001)
        precondition(abs(fitted.width / fitted.height - source.width / source.height) < 0.000001)

        let canvas = PixelSize(width: 1290, height: 2796)
        let placement = ScreenshotLayout.centeredRect(size: fitted, in: canvas, centerY: 1705)
        precondition(placement.minX >= 0)
        precondition(placement.maxX <= canvas.width)
        precondition(placement.minY >= 0)
        precondition(placement.maxY <= canvas.height)

        print("traditional screenshot layout tests passed")
    }
}
