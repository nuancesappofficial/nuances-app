import Cocoa

let width = 1080
let height = 1920
let fps = 30
let speedFactor: CGFloat = 0.75 // 0.75x speed = 1.6 seconds total
let originalDuration: CGFloat = 1.2
let totalDuration = originalDuration / speedFactor // 1.6s
let totalFrames = Int(round(CGFloat(fps) * totalDuration)) // 48 frames
let outputDir = "/tmp/trans_splash_frames"
let iconPath = "/Users/users/vibe_coding_projects/nuances-app/assets/app_icons/icon_cutout2.png"

try? FileManager.default.createDirectory(atPath: outputDir, withIntermediateDirectories: true)

guard let iconImage = NSImage(contentsOf: URL(fileURLWithPath: iconPath))?.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("Failed to load icon_cutout2.png")
    exit(1)
}

let iconAspect = CGFloat(iconImage.width) / CGFloat(iconImage.height) // 615 / 496 = 1.2399

let colorSpace = CGColorSpaceCreateDeviceRGB()

// iPhone logical width = 390pt, 1080p scale = 1080 / 390 = 2.769
let scaleFactor: CGFloat = 1080.0 / 390.0

// In React Native AnimatedSplashV2:
// container is 142pt x 142pt with resizeMode="contain"
// So the max dimension is 142pt!
// In 1080p px: 142 * scaleFactor = ~393.2px
let containerSize: CGFloat = 142.0 * scaleFactor
// Since width > height, container fits width:
let logoBaseW: CGFloat = containerSize
let logoBaseH: CGFloat = logoBaseW / iconAspect

// Offsets in pt: [-40, 0, 44]
let offsets: [CGFloat] = [-40 * scaleFactor, 0, 44 * scaleFactor]

let panelSize: CGFloat = CGFloat(height) * 2.85
let travelDistance: CGFloat = -CGFloat(height) * 2.35

func easeInOutCubic(_ t: CGFloat) -> CGFloat {
    return t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
}

let panelColors = [
    CGColor(srgbRed: 59/255.0, green: 133/255.0, blue: 185/255.0, alpha: 1.0),
    CGColor(srgbRed: 72/255.0, green: 161/255.0, blue: 224/255.0, alpha: 1.0),
    CGColor(srgbRed: 106/255.0, green: 188/255.0, blue: 246/255.0, alpha: 1.0)
]
let delays: [CGFloat] = [0.12, 0.22, 0.27]

for f in 0..<totalFrames {
    let t = (CGFloat(f) / CGFloat(fps)) * speedFactor
    
    guard let ctx = CGContext(data: nil,
                              width: width,
                              height: height,
                              bitsPerComponent: 8,
                              bytesPerRow: width * 4,
                              space: colorSpace,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        continue
    }
    
    ctx.clear(CGRect(x: 0, y: 0, width: width, height: height))
    
    // Draw 3 WipePanels
    for i in 0..<3 {
        let delay = delays[i]
        let dur: CGFloat = 0.43
        var progress: CGFloat = 0
        if t > delay {
            let p = min(1.0, (t - delay) / dur)
            progress = travelDistance * easeInOutCubic(p)
        }
        
        ctx.saveGState()
        let centerX = CGFloat(width) / 2.0 + offsets[i] + progress
        let centerY = CGFloat(height) / 2.0 - offsets[i] - progress
        
        ctx.translateBy(x: centerX, y: centerY)
        ctx.rotate(by: -CGFloat.pi / 4.0)
        
        ctx.setFillColor(panelColors[i])
        ctx.fill(CGRect(x: -panelSize / 2.0, y: -panelSize / 2.0, width: panelSize, height: panelSize))
        ctx.restoreGState()
    }
    
    // Logo Animation:
    var logoOpacity: CGFloat = 1.0
    var logoScale: CGFloat = 1.0
    
    if t >= 0.12 {
        let exitProg = min(1.0, (t - 0.12) / 0.58)
        let exitT = easeInOutCubic(exitProg)
        if exitProg > 0.82 {
            logoOpacity = 1.0 - (exitProg - 0.82) / 0.18
        }
        logoScale = 1.12 * (1.0 - exitT * 0.98)
    } else {
        let p = t / 0.12
        logoScale = 1.0 + 0.12 * p
    }
    
    if logoOpacity > 0.01 && logoScale > 0.02 {
        let curW = logoBaseW * logoScale
        let curH = logoBaseH * logoScale
        let logoRect = CGRect(x: (CGFloat(width) - curW) / 2.0,
                              y: (CGFloat(height) - curH) / 2.0,
                              width: curW,
                              height: curH)
        
        ctx.saveGState()
        ctx.setAlpha(logoOpacity)
        ctx.draw(iconImage, in: logoRect)
        ctx.restoreGState()
    }
    
    let image = ctx.makeImage()!
    let frameName = String(format: "%@/frame_%03d.png", outputDir, f)
    let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: frameName) as CFURL, "public.png" as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, image, nil)
    CGImageDestinationFinalize(dest)
}

print("Rendered aspect-corrected splash frames to \(outputDir)")
