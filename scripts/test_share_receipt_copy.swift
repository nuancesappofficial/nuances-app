@main
struct ShareReceiptCopyTests {
    static func main() {
        let cases = [
            ("zh-TW", "收到🫡"),
            ("zh-CN", "收到🫡"),
            ("en", "Catch you later"),
            ("ja", "またあとで"),
            ("ko", "이따 봐요"),
            ("es", "Nos vemos luego"),
            ("fr", "À plus tard"),
            ("unknown", "Catch you later"),
        ]

        for (language, expected) in cases {
            let actual = ShareReceiptCopy.message(for: language)
            precondition(actual == expected, "\(language): expected \(expected), got \(actual)")
        }

        print("ShareReceiptCopyTests: \(cases.count) passed")
    }
}
