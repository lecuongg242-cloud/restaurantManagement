package vn.techmenu.thungan

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Tự cập nhật app Android (P24 24-02, ANDR-04, QD-030 D2) — cùng luật app Windows (desktop/lib/cap-nhat.mjs):
 * kiểm lúc mở app + mỗi giờ; tải xong mới hỏi, và chỉ hỏi khi máy để yên ≥ 5 phút (thu ngân đang bấm dở thì không chen
 * vào). Android không cho cài âm thầm ⇒ luôn có một lần bấm "Cập nhật".
 *
 * Nguồn: `{gốc}/api/android/latest?thongTin=1&app={thu-ngan|quan-ly}` → `{ phienBan, maPhienBan, tenTep, kichThuoc,
 * sha256, duongDan }`. Hai APK (P30, QD-033 D6) — mỗi app đọc tệp chỉ mục của mình, chỉ nhận tên tệp có tiền tố của mình.
 * Tệp tải về nằm trong bộ nhớ riêng của app; sai kích thước hoặc sai sha256 ⇒ xóa, lần sau tải lại (không cài tệp hỏng).
 */
class CapNhat(private val ctx: Context, private val goc: String) {
    data class BanMoi(val phienBan: String, val maPhienBan: Int, val tep: File)

    companion object {
        const val KIEM_MOI_MS = 60 * 60_000L

        /** Máy để yên chừng này giây mới hỏi. Bản thử đặt nhỏ hơn bằng biến build TECHMENU_YEN_GIAY. */
        val YEN_TOI_THIEU_GIAY = BuildConfig.YEN_TOI_THIEU_GIAY

        /** Cùng luật `duocCaiBanMoi` của app Windows. */
        fun duocHoi(daTaiXong: Boolean, giayKhongThaoTac: Long): Boolean =
            daTaiXong && giayKhongThaoTac >= YEN_TOI_THIEU_GIAY
    }

    private val thuMuc = File(ctx.filesDir, "cap-nhat").apply { mkdirs() }

    /** Chạy ở luồng nền. Trả bản mới ĐÃ TẢI XONG + kiểm xong, hoặc null (không có / lỗi — thử lại lần sau). */
    fun kiemVaTai(): BanMoi? {
        val tt = try {
            JSONObject(doc("$goc/api/android/latest?thongTin=1&app=${BuildConfig.APP_CAP_NHAT}"))
        } catch (_: Exception) {
            return null
        }
        val ma = tt.optInt("maPhienBan")
        val ten = tt.optString("tenTep")
        val sha = tt.optString("sha256")
        val co = tt.optLong("kichThuoc")
        val duongDan = tt.optString("duongDan")
        if (ma <= BuildConfig.VERSION_CODE || !Regex("^${Regex.escape(BuildConfig.TIEN_TO_TEP)}-\\d+\\.\\d+\\.\\d+\\.apk$").matches(ten) ||
            !Regex("^[0-9a-f]{64}$").matches(sha) || co <= 0 || !duongDan.startsWith("/api/android/update/")
        ) {
            donTepCu(null)
            return null
        }
        val tep = File(thuMuc, ten)
        if (!(tep.exists() && tep.length() == co && sha256(tep) == sha)) {
            donTepCu(null)
            val tam = File(thuMuc, "$ten.tam")
            try {
                taiVe("$goc$duongDan", tam)
            } catch (_: Exception) {
                tam.delete()
                return null
            }
            if (tam.length() != co || sha256(tam) != sha) {
                tam.delete()
                return null
            }
            tam.renameTo(tep)
        }
        donTepCu(tep)
        return BanMoi(tt.optString("phienBan"), ma, tep)
    }

    /** Xóa APK cũ (bản đã cài / bản bị thay) — giữ lại đúng `giu`. */
    private fun donTepCu(giu: File?) {
        thuMuc.listFiles()?.forEach { if (it != giu) it.delete() }
    }

    private fun doc(url: String): String {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 15_000
            c.readTimeout = 15_000
            c.setRequestProperty("Cache-Control", "no-store")
            if (c.responseCode !in 200..299) throw IllegalStateException("HTTP ${c.responseCode}")
            return c.inputStream.bufferedReader().use { it.readText() }
        } finally {
            c.disconnect()
        }
    }

    private fun taiVe(url: String, dich: File) {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 15_000
            c.readTimeout = 60_000
            c.instanceFollowRedirects = true // /api/android/update → GitHub Releases → máy chủ tệp của GitHub
            if (c.responseCode !in 200..299) throw IllegalStateException("HTTP ${c.responseCode}")
            c.inputStream.use { vao -> dich.outputStream().use { ra -> vao.copyTo(ra) } }
        } finally {
            c.disconnect()
        }
    }

    private fun sha256(tep: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        tep.inputStream().use { vao ->
            val dem = ByteArray(64 * 1024)
            while (true) {
                val n = vao.read(dem)
                if (n < 0) break
                md.update(dem, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }
}
