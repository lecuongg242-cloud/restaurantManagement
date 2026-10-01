package vn.techmenu.thungan

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream

/**
 * Phục vụ trang của app (đăng nhập, cài đặt máy in, mất mạng — chép từ desktop/trang/ lúc build) qua địa chỉ cục bộ
 * `https://appassets.androidplatform.net/assets/trang/…` (không dùng file://). Trang HTML được chèn thêm
 * `cau-noi-android.js` ngay trước `</head>` để có `window.techmenu` như preload.cjs của app Windows — tệp cùng nguồn nên
 * hợp với Content-Security-Policy `script-src 'self'` của các trang đó.
 */
class TrangCuaApp(private val ctx: Context) : WebViewAssetLoader.PathHandler {
    override fun handle(path: String): WebResourceResponse? {
        // Chỉ thư mục trang/, không cho đi ngược thư mục.
        if (!path.startsWith("trang/") || path.contains("..")) return null
        val bytes = try {
            ctx.assets.open(path).use { it.readBytes() }
        } catch (_: Exception) {
            return null
        }
        val mime = when (path.substringAfterLast('.', "")) {
            "html" -> "text/html"
            "js" -> "application/javascript"
            "css" -> "text/css"
            "png" -> "image/png"
            "svg" -> "image/svg+xml"
            else -> "application/octet-stream"
        }
        val noiDung = if (mime == "text/html") {
            String(bytes, Charsets.UTF_8)
                .replaceFirst("</head>", "<script src=\"cau-noi-android.js\"></script></head>")
                .toByteArray(Charsets.UTF_8)
        } else {
            bytes
        }
        return WebResourceResponse(mime, "utf-8", ByteArrayInputStream(noiDung))
    }
}
