package vn.techmenu.thungan

import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.webkit.CookieManager
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import java.util.concurrent.ExecutorService

/**
 * Phần giao diện của tự cập nhật (24-02, ANDR-04) — dùng chung cho app Thu ngân và app Quản lý (P30). Kiểm + tải ở nền
 * mỗi giờ (`CapNhat`); có bản mới ĐÃ TẢI và máy để yên đủ lâu thì hỏi "Cập nhật" / "Để sau"; lần đầu dẫn sang màn bật
 * "Cho phép từ nguồn này" rồi quay lại là cài.
 *
 * Activity gọi: `batDau()` trong onCreate, `thaoTac()` trong onUserInteraction, `tiepTuc()` trong onResume, `dung()` trong
 * onDestroy.
 */
class TuCapNhat(
    private val act: AppCompatActivity,
    private val nen: ExecutorService,
    /** Câu trấn an trong hộp hỏi — app Thu ngân nhắc cả cài đặt máy in. */
    private val giuNguyen: String = "Đăng nhập được giữ nguyên.",
) {
    private val capNhat = CapNhat(act, BuildConfig.CAP_NHAT_BASE)
    private val dongHo = Handler(Looper.getMainLooper())
    private var lanThaoTacCuoi = SystemClock.elapsedRealtime()
    private var hoanDen = 0L
    private var dangHoi = false
    private var choCaiSauKhiCapQuyen = false

    /** Bản mới đã tải xong + kiểm xong (menu app Thu ngân hiện "Cập nhật lên bản …"). */
    var banMoi: CapNhat.BanMoi? = null
        private set

    fun batDau() {
        val kiem = object : Runnable {
            override fun run() {
                nen.execute {
                    val ban = capNhat.kiemVaTai()
                    act.runOnUiThread { if (ban != null) banMoi = ban }
                }
                dongHo.postDelayed(this, CapNhat.KIEM_MOI_MS)
            }
        }
        dongHo.post(kiem)
        // Mỗi 30 giây xem máy đã để yên đủ lâu chưa (cùng luật app Windows) — có bản mới thì hỏi.
        val xem = object : Runnable {
            override fun run() {
                val yen = (SystemClock.elapsedRealtime() - lanThaoTacCuoi) / 1000
                if (!dangHoi && SystemClock.elapsedRealtime() >= hoanDen && CapNhat.duocHoi(banMoi != null, yen)) hoi()
                dongHo.postDelayed(this, 30_000)
            }
        }
        dongHo.postDelayed(xem, 30_000)
    }

    fun thaoTac() {
        lanThaoTacCuoi = SystemClock.elapsedRealtime()
    }

    /** Vừa bật "Cho phép từ nguồn này" trong Cài đặt Android rồi quay lại ⇒ cài luôn, không bắt bấm lại. */
    fun tiepTuc() {
        if (choCaiSauKhiCapQuyen && act.packageManager.canRequestPackageInstalls()) {
            choCaiSauKhiCapQuyen = false
            cai()
        }
    }

    fun dung() = dongHo.removeCallbacksAndMessages(null)

    private fun hoi() {
        val ban = banMoi ?: return
        dangHoi = true
        AlertDialog.Builder(act)
            .setTitle("Có bản mới ${ban.phienBan}")
            .setMessage("Cập nhật mất khoảng 1 phút. $giuNguyen")
            .setPositiveButton("Cập nhật") { _, _ -> cai() }
            .setNegativeButton("Để sau") { _, _ -> hoanDen = SystemClock.elapsedRealtime() + CapNhat.KIEM_MOI_MS }
            .setOnDismissListener { dangHoi = false }
            .show()
    }

    fun cai() {
        val ban = banMoi ?: return
        if (!ban.tep.exists()) {
            banMoi = null
            return
        }
        // Lần đầu: Android bắt người dùng tự bật "Cho phép từ nguồn này" cho app — mở đúng màn đó, quay lại là cài.
        if (!act.packageManager.canRequestPackageInstalls()) {
            choCaiSauKhiCapQuyen = true
            Toast.makeText(act, "Bật \"Cho phép từ nguồn này\" rồi quay lại để cập nhật.", Toast.LENGTH_LONG).show()
            act.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${act.packageName}")))
            return
        }
        CookieManager.getInstance().flush()
        val uri = FileProvider.getUriForFile(act, "${act.packageName}.cap-nhat", ban.tep)
        act.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}
