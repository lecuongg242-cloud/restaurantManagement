package vn.techmenu.thungan

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Kích hoạt máy bằng tài khoản chủ quán / quản lý chi nhánh (QD-030 D3) — gọi nguyên `/api/desktop/activate` của app
 * Windows, cùng cách đọc phản hồi như `xuLy("kich-hoat")` trong desktop/main.mjs. Mật khẩu chủ quán chỉ đi một lần
 * trong thân yêu cầu rồi bỏ. Chạy ở luồng nền.
 */
object KichHoat {
    fun goi(apiBase: String, vao: JSONObject, luu: (CauHinh) -> Unit): JSONObject {
        // "Có — máy quầy": máy chủ xoay mật khẩu `printer` + chuyển quán sang cầu in ⇒ trạm in cũ của quán (app Windows /
        // cầu in cũ) ngừng in — đúng ý: một trạm in mỗi quán (QD-030 D4). Trang đăng nhập đã báo trước điều này.
        val coMayIn = vao.optBoolean("coMayIn")
        val body = JSONObject()
            .put("email", vao.optString("email"))
            .put("password", vao.optString("password"))
            .put("coMayIn", coMayIn)
        vao.optString("tenantId").takeIf { it.isNotBlank() && it != "null" }?.let { body.put("tenantId", it) }

        val (ma, json) = try {
            post("$apiBase/api/desktop/activate", body)
        } catch (_: Exception) {
            return loi("Không kết nối được máy chủ — kiểm tra mạng rồi thử lại.")
        }
        if (ma !in 200..299) return loi(json.optString("error").ifBlank { "Không kích hoạt được — thử lại." })
        json.optJSONArray("chonChiNhanh")?.let { return JSONObject().put("chonChiNhanh", it) }

        val coTaiKhoan = coMayIn && json.optString("email").isNotBlank() && json.optString("password").isNotBlank()
        val printer: Any = if (coTaiKhoan) {
            JSONObject()
                .put("email", json.optString("email"))
                .put("matKhauMaHoa", MaHoa.maHoa(json.optString("password")))
                .put("supabaseUrl", json.optString("supabaseUrl"))
                .put("anonKey", json.optString("anonKey"))
        } else {
            JSONObject.NULL
        }
        val moi = CauHinh.tuJson(
            JSONObject()
                .put("apiBase", apiBase)
                .put("slug", json.optString("slug"))
                .put("tenantName", json.optString("tenantName"))
                .put("manHinh", if (coMayIn) "pos" else "kds")
                .put("nhieuChiNhanh", vao.optBoolean("nhieuChiNhanh"))
                .put("coMayIn", coTaiKhoan)
                .put("printer", printer)
                .put("mayIn", CauHinh.mayInMacDinh())
        ) ?: return loi("Máy chủ trả dữ liệu lạ — báo TechMenu.")
        if (coMayIn && !moi.coMayIn) return loi("Máy chủ chưa cấp tài khoản máy in — thử lại.")
        luu(moi)
        return JSONObject().put("ok", true)
    }

    private fun loi(chu: String) = JSONObject().put("loi", chu)

    private fun post(url: String, body: JSONObject): Pair<Int, JSONObject> {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 15_000
            c.readTimeout = 30_000
            c.doOutput = true
            c.setRequestProperty("content-type", "application/json")
            c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val ma = c.responseCode
            val luong = if (ma in 200..299) c.inputStream else c.errorStream
            val chu = luong?.bufferedReader()?.use { it.readText() } ?: ""
            val json = try {
                JSONObject(chu)
            } catch (_: Exception) {
                JSONObject()
            }
            return ma to json
        } finally {
            c.disconnect()
        }
    }
}
