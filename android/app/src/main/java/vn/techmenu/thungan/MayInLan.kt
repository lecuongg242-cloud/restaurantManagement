package vn.techmenu.thungan

import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Máy in mạng LAN, cổng 9100 (P24 24-03) — cùng cách làm của cầu in Node (`sendToPrinter`, `thuMayIn`, print-scan.mjs).
 * Chạy ở luồng nền.
 */
object MayInLan {
    private const val HET_GIO_GUI_MS = 8_000

    /** Khoảng chờ giữa các lần thử lại (giãn dần) — như `CHO_GIUA_LAN_MS` của cầu in. */
    private val CHO_GIUA_LAN_MS = longArrayOf(1_000, 3_000)

    /** Gửi byte thô; xong khi đã đẩy hết ra socket (nhiều máy in reset kết nối ngay sau khi nhận — không chờ đóng sạch). */
    fun gui(du: ByteArray, host: String, port: Int) {
        Socket().use { s ->
            s.soTimeout = HET_GIO_GUI_MS
            s.connect(InetSocketAddress(host, port), HET_GIO_GUI_MS)
            s.getOutputStream().apply {
                write(du)
                flush()
            }
        }
    }

    /**
     * Gửi, hỏng thì thử lại `soLanThuLai` lần. Phần lớn lỗi là chớp nhoáng (nghẽn LAN) — dữ liệu qt-food 24/09/2026: 122
     * phiếu không tới bếp khi hỏng một lần là bỏ. Ném lỗi của LẦN CUỐI.
     */
    fun guiCoThuLai(du: ByteArray, host: String, port: Int, soLanThuLai: Int = 2) {
        var loi: Exception? = null
        for (lan in 0..soLanThuLai) {
            try {
                gui(du, host, port)
                return
            } catch (e: Exception) {
                loi = e
                if (lan < soLanThuLai) Thread.sleep(CHO_GIUA_LAN_MS[minOf(lan, CHO_GIUA_LAN_MS.size - 1)])
            }
        }
        throw loi!!
    }

    /** Máy in có phản hồi không: mở rồi đóng TCP NGAY, không gửi byte nào — máy in không nhả giấy. */
    fun thu(host: String, port: Int, hetGioMs: Int = 3_000): Boolean = try {
        Socket().use { it.connect(InetSocketAddress(host, port), hetGioMs) }
        true
    } catch (_: Exception) {
        false
    }

    /** Các dải /24 mà máy đang nối (bỏ loopback, card ảo 169.254). */
    private fun daiMang(): List<String> = buildSet {
        for (nic in NetworkInterface.getNetworkInterfaces()) {
            if (!nic.isUp || nic.isLoopback) continue
            for (dc in nic.inetAddresses) {
                if (dc !is Inet4Address) continue
                val ip = dc.hostAddress ?: continue
                if (ip.startsWith("169.254.")) continue
                add(ip.substringBeforeLast('.'))
            }
        }
    }.toList()

    /** "Dò máy in": quét cổng 9100 cả dải /24 (64 luồng, 900 ms mỗi địa chỉ) — như print-scan.mjs. Tối đa ~1 phút. */
    fun do9100(port: Int = 9100): List<String> {
        val dai = daiMang()
        if (dai.isEmpty()) return emptyList()
        val tho = Executors.newFixedThreadPool(64)
        try {
            val viec = dai.flatMap { d -> (1..254).map { n -> "$d.$n" } }
                .map { ip -> Callable { if (thu(ip, port, 900)) ip else null } }
            return tho.invokeAll(viec, 60, TimeUnit.SECONDS)
                .mapNotNull { f -> try { f.get() } catch (_: Exception) { null } }
                .sortedBy { ip -> ip.substringAfterLast('.').toIntOrNull() ?: 0 }
        } finally {
            tho.shutdownNow()
        }
    }
}
