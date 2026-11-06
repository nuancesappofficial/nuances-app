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

    static func openAppPrompt(for language: String) -> (message: String, action: String) {
        switch language {
        case "zh-TW":
            return ("請先開啟 Nuances 並登入，再重新分享一次。", "好")
        case "zh-CN":
            return ("请先打开 Nuances 并登录，再重新分享一次。", "好")
        case "ja":
            return ("Nuances を開いてログインしてから、もう一度共有してください。", "OK")
        case "ko":
            return ("Nuances를 열어 로그인한 후 다시 공유해 주세요.", "확인")
        case "es":
            return ("Abre Nuances e inicia sesión; luego vuelve a compartir.", "OK")
        case "fr":
            return ("Ouvrez Nuances et connectez-vous, puis partagez à nouveau.", "OK")
        default:
            return ("Open Nuances and sign in, then share again.", "OK")
        }
    }
}
