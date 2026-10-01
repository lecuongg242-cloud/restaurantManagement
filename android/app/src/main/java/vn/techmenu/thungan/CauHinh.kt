package vn.techmenu.thungan

import android.content.Context
import org.json.JSONObject

/**
 * Cấu hình máy (QD-030 D3) — CÙNG hình dạng `cau-hinh.json` của app Windows (desktop/lib/cau-hinh.mjs).
 * KHÔNG có trường nào chứa mật khẩu chủ quán; mật khẩu tài khoản `printer` chỉ lưu dạng đã mã hóa (MaHoa).
 */
data class CauHinh(
    val apiBase: String,
    val slug: String,
    val tenantName: String,
    val manHinh: String, // "pos" | "kds"
    val nhieuChiNhanh: Boolean,
    val coMayIn: Boolean,
    val printer: JSONObject?, // { email, matKhauMaHoa, supabaseUrl, anonKey } — chỉ khi coMayIn
    val mayIn: JSONObject, // { bep, quay, kho } — dùng từ 24-03
) {
    fun duongDan(man: String = manHinh): String = "$apiBase/r/$slug/${if (man == "kds") "kds" else "pos"}"

    fun toJson(): JSONObject = JSONObject()
        .put("apiBase", apiBase)
        .put("slug", slug)
        .put("tenantName", tenantName)
        .put("manHinh", manHinh)
        .put("nhieuChiNhanh", nhieuChiNhanh)
        .put("coMayIn", coMayIn)
        .put("printer", printer ?: JSONObject.NULL)
        .put("mayIn", mayIn)

    companion object {
        private val SLUG = Regex("^[a-z0-9][a-z0-9-]{0,62}$")

        fun mayInMacDinh(): JSONObject =
            JSONObject().put("bep", JSONObject.NULL).put("quay", JSONObject.NULL).put("kho", "80")

        /** Kiểm từng trường; sai một trường là bỏ cả cấu hình (máy về màn Đăng nhập) — không chạy với dữ liệu lạ. */
        fun tuJson(j: JSONObject): CauHinh? {
            val apiBase = j.optString("apiBase").trimEnd('/')
            val slug = j.optString("slug")
            val ten = j.optString("tenantName")
            if (!apiBase.startsWith("https://") || !SLUG.matches(slug) || ten.isBlank()) return null
            val coMayIn = j.optBoolean("coMayIn")
            val printer = j.optJSONObject("printer")
            if (coMayIn && (printer == null || printer.optString("email").isBlank() ||
                    printer.optString("matKhauMaHoa").isBlank())
            ) return null
            return CauHinh(
                apiBase = apiBase,
                slug = slug,
                tenantName = ten,
                manHinh = if (j.optString("manHinh") == "kds") "kds" else "pos",
                nhieuChiNhanh = j.optBoolean("nhieuChiNhanh"),
                coMayIn = coMayIn,
                printer = if (coMayIn) printer else null,
                mayIn = j.optJSONObject("mayIn") ?: mayInMacDinh(),
            )
        }
    }
}

class CauHinhKho(ctx: Context) {
    private val sp = ctx.getSharedPreferences("cau-hinh", Context.MODE_PRIVATE)

    fun doc(): CauHinh? = try {
        sp.getString("json", null)?.let { CauHinh.tuJson(JSONObject(it)) }
    } catch (_: Exception) {
        null
    }

    /** `commit` (ghi đồng bộ) — máy quầy hay bị rút điện, đừng để cấu hình nằm trong bộ đệm. */
    fun ghi(c: CauHinh) = sp.edit().putString("json", c.toJson().toString()).commit()

    fun xoa() = sp.edit().clear().commit()
}
