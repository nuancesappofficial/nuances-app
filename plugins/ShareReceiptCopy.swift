enum ShareReceiptCopy {
    /// Shown when everything shared was saved.
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

    /// Shown only when photos are still loading after a short wait
    /// (for example, originals that live in iCloud).
    static func loading(for language: String) -> String {
        switch language {
        case "zh-TW":
            return "收到了，照片還在載入…"
        case "zh-CN":
            return "收到了，照片还在加载…"
        case "ja":
            return "受け取りました。写真を読み込み中…"
        case "ko":
            return "받았어요. 사진 불러오는 중…"
        case "es":
            return "¡Recibido! Cargando fotos…"
        case "fr":
            return "Bien reçu ! Chargement des photos…"
        default:
            return "Got it, still loading photos…"
        }
    }

    /// Some photos were saved, the rest never loaded.
    static func partial(for language: String, saved: Int, total: Int) -> String {
        switch language {
        case "zh-TW":
            return "收到 \(saved)/\(total) 張，其他沒載到"
        case "zh-CN":
            return "收到 \(saved)/\(total) 张，其他没加载到"
        case "ja":
            return "\(total)枚中\(saved)枚を受け取りました。残りは読み込めませんでした"
        case "ko":
            return "\(total)장 중 \(saved)장 받았어요. 나머지는 못 불러왔어요"
        case "es":
            return "Recibidas \(saved) de \(total) fotos; el resto no cargó"
        case "fr":
            return "\(saved) photo(s) sur \(total) reçue(s) ; le reste n'a pas chargé"
        default:
            return "Got \(saved) of \(total) photos; the rest didn't load"
        }
    }

    /// No photo loaded at all.
    static func failed(for language: String) -> String {
        switch language {
        case "zh-TW":
            return "照片沒載到，有網路時再分享一次"
        case "zh-CN":
            return "照片没加载到，有网络时再分享一次"
        case "ja":
            return "写真を読み込めませんでした。電波のある場所でもう一度共有してください"
        case "ko":
            return "사진을 불러오지 못했어요. 인터넷이 될 때 다시 공유해 주세요"
        case "es":
            return "No se cargaron las fotos. Vuelve a compartirlas cuando tengas conexión"
        case "fr":
            return "Les photos n'ont pas chargé. Partage-les à nouveau une fois connecté"
        default:
            return "Photos didn't load. Share again when you're online"
        }
    }
}
