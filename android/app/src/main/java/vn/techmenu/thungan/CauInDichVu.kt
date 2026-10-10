package vn.techmenu.thungan

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.BitmapFactory
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Cầu in NẰM TRONG APP Android (P24 24-03, ANDR-05/06, QD-030 D4/D5) — chuyển nguyên hành vi `scripts/print-bridge.mjs`
 * bản 4 sang mã gốc (Android không chạy Node): poll `print_jobs` → in thẳng ra máy in LAN → đánh dấu; nhịp tim 30 giây.
 *
 * Chạy là dịch vụ có thông báo thường trực (Android không tắt), giữ CPU + Wi-Fi thức khi tắt màn. Đăng nhập bằng tài khoản
 * `printer` của quán (không bao giờ service-role — QD-012 §1); tenant suy từ token.
 */
class CauInDichVu : Service() {
    companion object {
        private const val KENH = "cau-in"
        private const val MA_THONG_BAO = 1
        private const val PHIEN_BAN_CAU_IN = 4 // cùng giao thức nhịp tim với print-bridge bản 4
        private const val MAX_TUOI_PHUT = 30L
        private const val NHIP_TIM_GIAY = 30L
        private const val POLL_MS = 2_000L

        fun batDau(ctx: Context) = ContextCompat.startForegroundService(ctx, Intent(ctx, CauInDichVu::class.java))
        fun dungLai(ctx: Context) = ctx.stopService(Intent(ctx, CauInDichVu::class.java))

        /** Nhịp poll thích ứng (PERF-03): 0–4 nhịp rỗng → 2 s · 5–14 → 5 s · ≥ 15 → 10 s. */
        fun nhipKeTiep(soNhipRong: Int): Long = when {
            soNhipRong >= 15 -> POLL_MS * 5
            soNhipRong >= 5 -> POLL_MS * 5 / 2
            else -> POLL_MS
        }
    }

    private lateinit var c: CauHinh
    private var matKhau = ""
    private var token: String? = null
    private var tenantId: String? = null
    @Volatile private var dung = false
    @Volatile private var bepPhanHoi: Boolean? = null
    @Volatile private var quayPhanHoi: Boolean? = null
    @Volatile private var nhipTimLoi = false
    private val dangIn = ConcurrentHashMap.newKeySet<String>()
    /** Phiếu ĐÃ ra giấy nhưng chưa báo "đã in" được (mạng rớt) — không bao giờ in lại; báo bù đầu mỗi lượt. */
    private val daInChuaBao = ConcurrentHashMap<String, JSONObject>()
    private var vong: Thread? = null
    private var hen: ScheduledExecutorService? = null
    private var thucCpu: PowerManager.WakeLock? = null
    private var thucWifi: WifiManager.WifiLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (vong != null) return START_STICKY // đã chạy — một vòng in duy nhất (hai vòng = mỗi phiếu ra hai tờ)
        val cauHinh = CauHinhKho(this).doc()
        val mk = cauHinh?.printer?.optString("matKhauMaHoa")?.let { MaHoa.giaiMa(it) }
        batThongBao("Đang khởi động…")
        if (cauHinh == null || !cauHinh.coMayIn || mk.isNullOrEmpty()) {
            stopSelf()
            return START_NOT_STICKY
        }
        c = cauHinh
        matKhau = mk
        giuThuc()
        hen = Executors.newSingleThreadScheduledExecutor().also {
            // Nhịp tim timer RIÊNG: đang kẹt gửi máy in mà ngừng báo sống thì POS tưởng cầu in chết, chuyển sang in trình
            // duyệt, rồi cầu in gửi xong ⇒ bếp nhận hai tờ.
            it.scheduleWithFixedDelay({ baoSong() }, 0, NHIP_TIM_GIAY, TimeUnit.SECONDS)
        }
        vong = Thread({ chay() }, "cau-in").apply { start() }
        return START_STICKY
    }

    override fun onDestroy() {
        dung = true
        hen?.shutdownNow()
        vong?.interrupt()
        thucCpu?.let { if (it.isHeld) it.release() }
        thucWifi?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    @SuppressLint("WakelockTimeout")
    private fun giuThuc() {
        thucCpu = (getSystemService(POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "techmenu:cau-in").apply { acquire() }
        @Suppress("DEPRECATION")
        thucWifi = (applicationContext.getSystemService(WIFI_SERVICE) as WifiManager)
            .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "techmenu:cau-in").apply { acquire() }
    }

    // ── Thông báo thường trực (Giao diện #6) ──────────────────────────────────────────────────────────────────────

    private fun batThongBao(dong: String) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(KENH) == null) {
            nm.createNotificationChannel(NotificationChannel(KENH, "Cầu in", NotificationManager.IMPORTANCE_LOW))
        }
        val tb = taoThongBao(dong, loi = false)
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(MA_THONG_BAO, tb, if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0)
        } else {
            startForeground(MA_THONG_BAO, tb)
        }
    }

    private fun taoThongBao(dong: String, loi: Boolean): Notification {
        val mo = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val ten = if (::c.isInitialized) c.tenantName else ""
        return NotificationCompat.Builder(this, KENH)
            .setSmallIcon(android.R.drawable.stat_sys_upload_done)
            .setContentTitle("TechMenu đang in cho quán $ten")
            .setContentText(dong)
            .setColor(if (loi) 0xFFC62828.toInt() else 0xFFFA520F.toInt())
            .setColorized(loi)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(mo)
            .build()
    }

    private fun capNhatThongBao() {
        val bep = c.mayIn.optJSONObject("bep")
        val quay = c.mayIn.optJSONObject("quay")
        val phan = mutableListOf<String>()
        var loi = nhipTimLoi
        if (nhipTimLoi) phan += "Mất kết nối máy chủ"
        if (bep != null) {
            if (bepPhanHoi == false) loi = true
            phan += if (bepPhanHoi == false) "Máy in bếp không phản hồi" else "Máy in bếp: sẵn sàng"
        } else if (quay != null) {
            phan += "Phiếu bếp in ra máy in quầy" // tình trạng nằm ở dòng máy in quầy ngay sau
        } else {
            phan += "Chưa cài máy in bếp"
        }
        if (quay != null) {
            if (quayPhanHoi == false) loi = true
            phan += if (quayPhanHoi == false) "Máy in quầy không phản hồi" else "Máy in quầy: sẵn sàng"
        }
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
            .notify(MA_THONG_BAO, taoThongBao(phan.joinToString(" · "), loi))
    }

    // ── Máy chủ (Supabase REST bằng tài khoản `printer`) ──────────────────────────────────────────────────────────

    private val supa get() = c.printer!!.optString("supabaseUrl").trimEnd('/')
    private val anon get() = c.printer!!.optString("anonKey")

    private fun dangNhap() {
        val (ma, chu) = http(
            "$supa/auth/v1/token?grant_type=password", "POST",
            JSONObject().put("email", c.printer!!.optString("email")).put("password", matKhau).toString(),
            mapOf("apikey" to anon),
        )
        if (ma !in 200..299) throw IllegalStateException("Đăng nhập máy in thất bại (HTTP $ma)")
        token = JSONObject(chu).optString("access_token").ifEmpty { null }
    }

    /** PostgREST; 401 ⇒ đăng nhập lại MỘT lần rồi thử lại (bền với vòng chạy nhiều ngày). */
    private fun rest(duong: String, method: String = "GET", body: String? = null, them: Map<String, String> = emptyMap(), thuLai: Boolean = true): String {
        if (token == null) dangNhap()
        val (ma, chu) = http("$supa/rest/v1$duong", method, body, mapOf("apikey" to anon, "Authorization" to "Bearer $token") + them)
        if (ma == 401 && thuLai) {
            token = null
            return rest(duong, method, body, them, false)
        }
        if (ma !in 200..299) throw IllegalStateException("HTTP $ma — ${chu.take(200)}")
        return chu
    }

    private fun http(url: String, method: String, body: String?, headers: Map<String, String>): Pair<Int, String> {
        val k = URL(url).openConnection() as HttpURLConnection
        try {
            k.requestMethod = method
            k.connectTimeout = 15_000
            k.readTimeout = 30_000
            k.setRequestProperty("Content-Type", "application/json")
            headers.forEach { (a, b) -> k.setRequestProperty(a, b) }
            if (body != null) {
                k.doOutput = true
                k.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val ma = k.responseCode
            val luong = if (ma in 200..299) k.inputStream else k.errorStream
            return ma to (luong?.bufferedReader()?.use { it.readText() } ?: "")
        } finally {
            k.disconnect()
        }
    }

    private fun traTenant(): String? = try {
        JSONArray(rest("/memberships?select=tenant_id&role=eq.printer&active=is.true&limit=1"))
            .optJSONObject(0)?.optString("tenant_id")?.ifEmpty { null }
    } catch (_: Exception) {
        null // quán tạm ngưng / mất mạng — thử lại lượt sau, không chết
    }

    // ── Nhịp tim (PRINT-08) ───────────────────────────────────────────────────────────────────────────────────────

    private fun baoSong() {
        try {
            val bep = c.mayIn.optJSONObject("bep")
            val quay = c.mayIn.optJSONObject("quay")
            // Máy in rẻ chỉ nhận một kết nối một lúc — không thử đúng lúc đang in.
            if (dangIn.isEmpty()) {
                bepPhanHoi = bep?.let { MayInLan.thu(it.optString("host"), it.optInt("port", 9100)) }
                quayPhanHoi = quay?.let { MayInLan.thu(it.optString("host"), it.optInt("port", 9100)) }
            }
            // PRINT-18: không có máy in bếp riêng → phiếu bếp ra máy quầy, máy in bếp CHÍNH LÀ máy quầy.
            if (bep == null && quay != null) bepPhanHoi = quayPhanHoi
            val diaChiBep = when {
                bep != null -> "${bep.optString("host")}:${bep.optInt("port", 9100)}"
                quay != null -> "máy in quầy lan:${quay.optString("host")}:${quay.optInt("port", 9100)}"
                else -> "127.0.0.1:9"
            }
            val than = JSONObject()
                .put("p_printer_ok", bepPhanHoi ?: JSONObject.NULL)
                .put("p_printer_host", diaChiBep)
                .put("p_version", PHIEN_BAN_CAU_IN)
                .put("p_agent", "android/${BuildConfig.VERSION_NAME}")
            if (quay != null) {
                than.put("p_counter_ok", quayPhanHoi ?: JSONObject.NULL)
                than.put("p_counter_target", "lan:${quay.optString("host")}:${quay.optInt("port", 9100)}")
            }
            rest("/rpc/printer_heartbeat", "POST", than.toString())
            nhipTimLoi = false
        } catch (_: Exception) {
            nhipTimLoi = true
        }
        capNhatThongBao()
    }

    // ── Vòng in ───────────────────────────────────────────────────────────────────────────────────────────────────

    private fun chay() {
        var rong = 0
        while (!dung) {
            when (motLuot()) {
                "rong" -> rong++
                "co-phieu" -> rong = 0
                // "khong-xac-dinh" (mất mạng / quán tạm ngưng): giữ nguyên, không phạt không thưởng.
            }
            try {
                Thread.sleep(nhipKeTiep(rong))
            } catch (_: InterruptedException) {
                return
            }
        }
    }

    private fun danhDau(id: String, patch: JSONObject) {
        rest("/print_jobs?id=eq.$id", "PATCH", patch.toString(), mapOf("Prefer" to "return=minimal"))
    }

    private fun baoDaIn(id: String) {
        val patch = JSONObject().put("status", "printed").put("printed_at", Instant.now().toString())
        try {
            danhDau(id, patch)
        } catch (_: Exception) {
            daInChuaBao[id] = patch
        }
    }

    private fun baoBu() {
        for ((id, patch) in daInChuaBao) {
            try {
                danhDau(id, patch)
                daInChuaBao.remove(id)
            } catch (_: Exception) {
                return // vẫn mất mạng — lượt sau
            }
        }
    }

    private fun motLuot(): String {
        if (tenantId == null) tenantId = traTenant() ?: return "khong-xac-dinh"
        baoBu()
        val coQuay = c.mayIn.optJSONObject("quay") != null
        val tu = URLEncoder.encode(Instant.now().minusSeconds(MAX_TUOI_PHUT * 60).toString(), "UTF-8")
        val phieu = try {
            JSONArray(
                rest(
                    "/print_jobs?select=id,type,payload&tenant_id=eq.$tenantId" +
                        (if (coQuay) "&type=in.(kitchen_ticket,receipt,customer_ticket)" else "&type=eq.kitchen_ticket") +
                        "&status=eq.pending&created_at=gte.$tu&order=created_at.asc&limit=10"
                )
            )
        } catch (_: Exception) {
            return "khong-xac-dinh" // lỗi mạng KHÔNG phải "rỗng"
        }
        for (i in 0 until phieu.length()) {
            if (dung) break
            val p = phieu.optJSONObject(i) ?: continue
            val id = p.optString("id")
            if (id.isEmpty() || dangIn.contains(id) || daInChuaBao.containsKey(id)) continue
            val loai = p.optString("type", "kitchen_ticket")
            dangIn.add(id)
            try {
                if (loai == "kitchen_ticket") inBep(p) else if (coQuay) inQuay(id) else continue
                ghiKetQua(loai, true)
                baoDaIn(id)
            } catch (_: Exception) {
                ghiKetQua(loai, false)
                try {
                    danhDau(id, JSONObject().put("status", "failed"))
                } catch (_: Exception) {
                }
            } finally {
                dangIn.remove(id)
                capNhatThongBao()
            }
        }
        return if (phieu.length() > 0) "co-phieu" else "rong"
    }

    /** Kết quả in thật. Phiếu bếp in ra máy quầy (PRINT-18) thì đó cũng là kết quả của máy quầy. */
    private fun ghiKetQua(loai: String, ok: Boolean) {
        if (loai != "kitchen_ticket") {
            quayPhanHoi = ok
            return
        }
        bepPhanHoi = ok
        if (c.mayIn.optJSONObject("bep") == null && c.mayIn.optJSONObject("quay") != null) quayPhanHoi = ok
    }

    private fun inBep(p: JSONObject) {
        // Không có máy in bếp riêng → in ra máy quầy (PRINT-18). Không có cả hai: báo lỗi rõ (phiếu `failed`, chip đỏ).
        val may = c.mayIn.optJSONObject("bep") ?: c.mayIn.optJSONObject("quay")
            ?: throw IllegalStateException("Chưa cài máy in bếp lẫn máy in quầy")
        val du = EscPos.phieuBep(p.optJSONObject("payload") ?: JSONObject(), EscPos.soKyTu(c.mayIn.optString("kho", "80")))
        MayInLan.guiCoThuLai(du, may.optString("host"), may.optInt("port", 9100))
    }

    /** Hóa đơn / phiếu khách: ảnh PNG có dấu do máy chủ dựng (QD-020 D4) → lệnh in ảnh → máy in quầy LAN. */
    private fun inQuay(id: String, thuLai: Boolean = true) {
        val quay = c.mayIn.optJSONObject("quay") ?: return
        if (token == null) dangNhap()
        val k = URL("${c.apiBase}/api/print/jobs/$id/image?w=${c.mayIn.optString("kho", "80")}").openConnection() as HttpURLConnection
        val anh = try {
            k.connectTimeout = 15_000
            k.readTimeout = 30_000
            k.setRequestProperty("Authorization", "Bearer $token")
            if (k.responseCode == 401 && thuLai) {
                token = null
                return inQuay(id, false)
            }
            if (k.responseCode !in 200..299) throw IllegalStateException("tải ảnh phiếu HTTP ${k.responseCode}")
            k.inputStream.use { it.readBytes() }
        } finally {
            k.disconnect()
        }
        val bmp = BitmapFactory.decodeByteArray(anh, 0, anh.size) ?: throw IllegalStateException("ảnh phiếu hỏng")
        val diem = IntArray(bmp.width * bmp.height)
        bmp.getPixels(diem, 0, bmp.width, 0, 0, bmp.width, bmp.height)
        val du = EscPos.lenhInAnh(diem, bmp.width, bmp.height)
        bmp.recycle()
        MayInLan.guiCoThuLai(du, quay.optString("host"), quay.optInt("port", 9100))
    }
}
