package vn.techmenu.thungan

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.text.Normalizer
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Lệnh ESC/POS cho máy in nhiệt (P24 24-03) — chuyển NGUYÊN từ `scripts/print-bridge.mjs` (bản 4) để phiếu từ tablet
 * giống hệt phiếu từ cầu in cũ / app Windows: bếp đọc quen mắt. Hàm thuần (không dùng API Android) ⇒ test được trên JVM.
 */
object EscPos {
    private const val ESC = 0x1b
    private const val GS = 0x1d
    private val INIT = byteArrayOf(ESC.toByte(), 0x40)
    private val TRAI = byteArrayOf(ESC.toByte(), 0x61, 0)
    private val GIUA = byteArrayOf(ESC.toByte(), 0x61, 1)
    private val DAM = byteArrayOf(ESC.toByte(), 0x45, 1)
    private val HET_DAM = byteArrayOf(ESC.toByte(), 0x45, 0)
    private val CO_THUONG = byteArrayOf(GS.toByte(), 0x21, 0x00)
    private val CO_CAO = byteArrayOf(GS.toByte(), 0x21, 0x01)
    private val CO_LON = byteArrayOf(GS.toByte(), 0x21, 0x11)
    private val CAT = byteArrayOf(GS.toByte(), 0x56, 0x42, 0x00)

    /** Số ký tự mỗi dòng theo khổ giấy (80 mm = 48, 58 mm = 32) — như PRINTER_CHARS của cầu in. */
    fun soKyTu(kho: String) = if (kho == "58") 32 else 48

    /**
     * Bỏ dấu tiếng Việt về ASCII — máy in nhiệt phổ thông không có bảng mã Việt; "PHO BO TAI" luôn in được, "PHỞ BÒ" dễ ra
     * ký tự rác. Giống hệt `ascii()` của cầu in Node.
     */
    fun ascii(s: String?): String = Normalizer.normalize(s ?: "", Normalizer.Form.NFD)
        .replace(Regex("[\\u0300-\\u036f]"), "")
        .replace('đ', 'd')
        .replace('Đ', 'D')
        .replace(Regex("[^\\x20-\\x7e]"), " ")
        .trimEnd()

    /** Ngắt dòng theo bề rộng; từ dài hơn một dòng thì cắt cứng. */
    fun ngatDong(chu: String?, rong: Int): List<String> {
        val ra = mutableListOf<String>()
        var dong = ""
        for (tu in ascii(chu).split(Regex("\\s+")).filter { it.isNotEmpty() }) {
            dong = when {
                dong.isEmpty() -> tu
                dong.length + 1 + tu.length <= rong -> "$dong $tu"
                else -> {
                    ra.add(dong)
                    tu
                }
            }
            while (dong.length > rong) {
                ra.add(dong.substring(0, rong))
                dong = dong.substring(rong)
            }
        }
        if (dong.isNotEmpty()) ra.add(dong)
        return ra.ifEmpty { listOf("") }
    }

    /** Một dòng hai đầu. */
    fun hang(trai: String, phai: String, rong: Int): String {
        val l = ascii(trai)
        val r = ascii(phai)
        return l + " ".repeat(maxOf(1, rong - l.length - r.length)) + r
    }

    /** "20:47 01-10" — đúng chuỗi `toLocaleString("vi-VN", …)` của cầu in Node in ra (đã đo). */
    private val GIO_VN = DateTimeFormatter.ofPattern("HH:mm dd-MM").withZone(ZoneId.of("Asia/Ho_Chi_Minh"))

    fun gioVn(iso: String?): String = try {
        if (iso.isNullOrBlank()) "" else GIO_VN.format(Instant.parse(iso.replace(Regex("\\+00:00$"), "Z")))
    } catch (_: Exception) {
        ""
    }

    /** Phiếu bếp từ payload `print_jobs` (KitchenTicketView) — bố cục khớp `buildKitchenTicket` của cầu in. */
    fun phieuBep(phieu: JSONObject, rong: Int): ByteArray {
        val ra = ByteArrayOutputStream()
        fun chu(s: String) = ra.write("$s\n".toByteArray(Charsets.ISO_8859_1))
        fun lenh(b: ByteArray) = ra.write(b)

        lenh(INIT)
        lenh(GIUA)
        lenh(DAM)
        ngatDong(phieu.optString("tenantName"), rong).forEach(::chu)
        chu("PHIEU BEP" + if (phieu.optBoolean("isReprint")) " (IN LAI)" else "")
        lenh(HET_DAM)
        if (phieu.has("kitchenNo") && !phieu.isNull("kitchenNo")) {
            lenh(CO_LON)
            lenh(DAM)
            chu("DON #${phieu.opt("kitchenNo")}")
            lenh(HET_DAM)
            lenh(CO_THUONG)
        }
        lenh(TRAI)
        chu("-".repeat(rong))
        val tenBan = if (phieu.isNull("tableName")) "-" else phieu.optString("tableName", "-")
        // Đơn không bàn (P35): in thẳng nơi phục vụ ("Tai quan" / "Mang ve"), không "Ban: ...".
        val noi = if (phieu.isNull("place")) "" else phieu.optString("place", "")
        chu(hang(if (noi.isNotEmpty()) noi else "Ban: $tenBan", "#${phieu.optString("ticketNo")}", rong))
        val mon = phieu.optJSONArray("items")
        var phan = 0
        for (i in 0 until (mon?.length() ?: 0)) phan += mon!!.optJSONObject(i)?.optInt("qty") ?: 0
        chu(hang(gioVn(phieu.optString("confirmedAt")), "$phan phan", rong))
        chu("-".repeat(rong))
        for (i in 0 until (mon?.length() ?: 0)) {
            val m = mon!!.optJSONObject(i) ?: continue
            lenh(DAM)
            lenh(CO_CAO)
            ngatDong("${m.optInt("qty")}x ${m.optString("name")}", rong).forEach(::chu)
            lenh(CO_THUONG)
            lenh(HET_DAM)
            val tc = m.optJSONArray("modifiers")
            for (j in 0 until (tc?.length() ?: 0)) ngatDong("+ ${tc!!.optString(j)}", rong - 2).forEach { chu("  $it") }
            val note = if (m.isNull("note")) "" else m.optString("note")
            if (note.isNotBlank()) {
                lenh(DAM)
                ngatDong(">> $note", rong - 2).forEach { chu("  $it") }
                lenh(HET_DAM)
            }
        }
        chu("-".repeat(rong))
        lenh(GIUA)
        chu("-- het phieu --")
        chu("")
        lenh(CAT)
        return ra.toByteArray()
    }

    /** Phiếu mẫu cho nút "In thử" — cùng nội dung chế độ `--test` của cầu in. */
    fun phieuThu(rong: Int, vai: String): ByteArray = phieuBep(
        JSONObject()
            .put("tenantName", "QUAN THU NGHIEM")
            .put("kitchenNo", 12)
            .put("tableName", if (vai == "quay") "Quay" else "Ban 5")
            .put("ticketNo", "TEST01")
            .put("confirmedAt", Instant.now().toString())
            .put(
                "items",
                org.json.JSONArray()
                    .put(JSONObject().put("qty", 2).put("name", "Phở bò tái").put("modifiers", org.json.JSONArray().put("Nhiều hành")).put("note", "Không rau"))
                    .put(JSONObject().put("qty", 1).put("name", "Cơm gà xối mỡ").put("modifiers", org.json.JSONArray()))
            ),
        rong,
    )

    /**
     * Ảnh hóa đơn (điểm ARGB, từng hàng) → lệnh in ảnh. Alpha phủ trên nền trắng rồi lấy ngưỡng độ sáng 160; điểm trái
     * nhất là bit CAO; cắt dòng trắng ở đáy (máy chủ ước dư chiều cao); `GS v 0` theo dải `dai` dòng; đẩy 4 dòng; cắt.
     * Giống `thanhAnhDen` + `lenhInAnh` của cầu in Node.
     */
    fun lenhInAnh(argb: IntArray, rong: Int, cao: Int, nguong: Int = 160, dai: Int = 128): ByteArray {
        val rongByte = (rong + 7) / 8
        val bits = ByteArray(rongByte * cao)
        var dongCuoi = -1
        for (y in 0 until cao) {
            for (x in 0 until rong) {
                val p = argb[y * rong + x]
                val a = ((p ushr 24) and 0xff) / 255.0
                val r = (p shr 16) and 0xff
                val g = (p shr 8) and 0xff
                val b = p and 0xff
                val sang = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a)
                if (sang < nguong) {
                    val i = y * rongByte + (x shr 3)
                    bits[i] = (bits[i].toInt() or (0x80 ushr (x and 7))).toByte()
                    dongCuoi = y
                }
            }
        }
        val caoMoi = dongCuoi + 1
        val ra = ByteArrayOutputStream()
        ra.write(INIT)
        var y = 0
        while (y < caoMoi) {
            val h = minOf(dai, caoMoi - y)
            ra.write(byteArrayOf(GS.toByte(), 0x76, 0x30, 0, (rongByte and 0xff).toByte(), (rongByte shr 8).toByte(), (h and 0xff).toByte(), (h shr 8).toByte()))
            ra.write(bits, y * rongByte, h * rongByte)
            y += dai
        }
        ra.write(byteArrayOf(ESC.toByte(), 0x64, 4))
        ra.write(CAT)
        return ra.toByteArray()
    }
}
