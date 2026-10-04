package vn.techmenu.thungan

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Tải tệp từ trang web trong app (Xuất Excel, PDF mã QR) vào thư mục Tải xuống (P30, Giao diện A5) — dùng chung cho màn
 * Quản trị của app Thu ngân và app Quản lý. Route xuất cần đăng nhập ⇒ gửi kèm cookie của ĐÚNG hồ sơ WebView đang xem.
 */
object TaiTep {
    const val MA_XIN_QUYEN = 2

    /** Android 8–9 phải có quyền ghi bộ nhớ mới lưu được vào Tải xuống; true = đã có / không cần. */
    fun coQuyen(act: Activity): Boolean =
        Build.VERSION.SDK_INT >= 29 ||
            ContextCompat.checkSelfPermission(act, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

    fun xinQuyen(act: Activity) =
        ActivityCompat.requestPermissions(act, arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), MA_XIN_QUYEN)

    fun tai(ctx: Context, cookie: CookieManager, url: String, ua: String, noiDungTep: String?, mime: String?) {
        val ten = URLUtil.guessFileName(url, noiDungTep, mime)
        val yeuCau = DownloadManager.Request(Uri.parse(url))
            .addRequestHeader("Cookie", cookie.getCookie(url) ?: "")
            .addRequestHeader("User-Agent", ua)
            .setTitle(ten)
            .setMimeType(mime)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, ten)
        (ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(yeuCau)
        Toast.makeText(ctx, "Đang tải $ten vào thư mục Tải xuống", Toast.LENGTH_LONG).show()
    }
}
