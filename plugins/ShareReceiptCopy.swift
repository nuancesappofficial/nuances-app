enum ShareReceiptCopy {
    static func message(for language: String) -> String {
        switch language {
        case "zh-TW", "zh-CN":
            return "收到🫡"
        case "ja":
            return "またあとで"
        case "ko":
            return "이따 봐요"
        case "es":
            return "Nos vemos luego"
        case "fr":
            return "À plus tard"
        default:
            return "Catch you later"
        }
    }
}
