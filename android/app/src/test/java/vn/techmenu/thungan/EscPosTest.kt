package vn.techmenu.thungan

import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Lệnh in từ tablet phải GIỐNG TỪNG BYTE phiếu của cầu in Node (scripts/print-bridge.mjs bản 4) — bếp đọc quen mắt, và
 * máy in đã chạy được với chuỗi lệnh đó. Mẫu vàng `phieu-bep-{48,32}.hex` dựng bằng chính `buildKitchenTicket` của Node.
 */
class EscPosTest {
    private fun tai(ten: String) = javaClass.classLoader!!.getResource(ten)!!.readText().trim()

    private fun hex(s: String) = ByteArray(s.length / 2) { i -> s.substring(i * 2, i * 2 + 2).toInt(16).toByte() }

    @Test
    fun phieuBepGiongCauInNode_80mm() {
        val phieu = JSONObject(tai("phieu-bep.json"))
        assertArrayEquals(hex(tai("phieu-bep-48.hex")), EscPos.phieuBep(phieu, 48))
    }

    @Test
    fun phieuBepGiongCauInNode_58mm() {
        val phieu = JSONObject(tai("phieu-bep.json"))
        assertArrayEquals(hex(tai("phieu-bep-32.hex")), EscPos.phieuBep(phieu, 32))
    }

    @Test
    fun boDauTiengViet() {
        assertEquals("Pho bo tai - Duong Dinh Nghe", EscPos.ascii("Phở bò tái - Đường Đình Nghệ"))
        assertEquals("ca phe sua da", EscPos.ascii("cà phê sữa đá  "))
    }

    @Test
    fun ngatDongVaCatTuDai() {
        assertEquals(listOf("abc def", "ghi"), EscPos.ngatDong("abc def ghi", 7))
        assertEquals(listOf("abcdefg", "hij"), EscPos.ngatDong("abcdefghij", 7))
        assertEquals(listOf(""), EscPos.ngatDong("", 7))
    }

    @Test
    fun lenhInAnh_bitVaCatDongTrangCuoi() {
        // Ảnh 10×4: hàng 0 điểm đen ở x=0 và x=9; hàng 1 trắng; hàng 2 đen trong suốt (alpha 0 ⇒ trắng); hàng 3 trắng.
        val trang = 0xFFFFFFFF.toInt()
        val den = 0xFF000000.toInt()
        val diem = IntArray(40) { trang }
        diem[0] = den
        diem[9] = den
        diem[20] = 0x00000000 // đen nhưng trong suốt
        val du = EscPos.lenhInAnh(diem, 10, 4)
        // ESC @ | GS v 0 0 rongByte=2,0 cao=1,0 (cắt còn 1 dòng có mực) | 2 byte bit | ESC d 4 | GS V B 0
        val mongDoi = byteArrayOf(
            0x1b, 0x40,
            0x1d, 0x76, 0x30, 0, 2, 0, 1, 0,
            0x80.toByte(), 0x40,
            0x1b, 0x64, 4,
            0x1d, 0x56, 0x42, 0,
        )
        assertArrayEquals(mongDoi, du)
    }

    @Test
    fun lenhInAnh_chiaDai() {
        val den = 0xFF000000.toInt()
        val du = EscPos.lenhInAnh(IntArray(8 * 300) { den }, 8, 300, dai = 128)
        // 300 dòng ⇒ 3 dải (128 + 128 + 44): đếm số lệnh GS v 0.
        var dem = 0
        for (i in 0 until du.size - 2) if (du[i] == 0x1d.toByte() && du[i + 1] == 0x76.toByte() && du[i + 2] == 0x30.toByte()) dem++
        assertEquals(3, dem)
        assertTrue(du.size > 300)
    }

    @Test
    fun nhipPollThichUng() {
        assertEquals(2_000L, CauInDichVu.nhipKeTiep(0))
        assertEquals(5_000L, CauInDichVu.nhipKeTiep(5))
        assertEquals(10_000L, CauInDichVu.nhipKeTiep(15))
    }
}
