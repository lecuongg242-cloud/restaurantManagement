package vn.techmenu.thungan

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * ☰ → "Quản trị" (P30 30-01, ANDR-09, QD-033 D1): trang quản trị web mở phủ lên POS, trong WebView dùng HỒ SƠ RIÊNG
 * ("quan-tri"). POS và admin cùng tên miền ⇒ chung cookie nếu chung hồ sơ — chủ đăng nhập admin sẽ đá thu ngân đang bán
 * ra ngoài. Hồ sơ riêng giữ đăng nhập quản trị giữa các lần mở, tách khỏi POS. Máy có WebView cũ (không có hồ sơ riêng)
 * thì MainActivity mở trình duyệt thay vì vào đây.
 */
class QuanTriActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private val apiBase = BuildConfig.API_BASE
    private val nguonApi: String = Uri.parse(apiBase).let { "${it.scheme}://${it.authority}" }
    private val loader by lazy {
        WebViewAssetLoader.Builder().addPathHandler("/assets/", TrangCuaApp(this)).build()
    }
    private var choTai: Runnable? = null

    companion object {
        const val HO_SO = "quan-tri"
        private const val THEM_SLUG = "slug"
        private const val THEM_TEN = "tenQuan"

        fun hoTroHoSoRieng() = WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)

        /** Vào qua trang đăng nhập quản trị (`chi-quan-tri=1`): thu ngân đăng nhập nhầm nhận câu "không có quyền". */
        fun duongDan(c: CauHinh) = "${c.apiBase}/r/${c.slug}/admin/login?chi-quan-tri=1"

        fun mo(ctx: Context, c: CauHinh) {
            if (!hoTroHoSoRieng()) {
                // Không mở trong WebView chung (đá thu ngân khỏi POS) — sang trình duyệt của máy.
                Toast.makeText(ctx, "Máy chưa hỗ trợ mở trong app — đã mở bằng trình duyệt.", Toast.LENGTH_LONG).show()
                try {
                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(duongDan(c))))
                } catch (_: ActivityNotFoundException) {
                }
                return
            }
            ctx.startActivity(
                Intent(ctx, QuanTriActivity::class.java).putExtra(THEM_SLUG, c.slug).putExtra(THEM_TEN, c.tenantName)
            )
        }

        /** "Đăng xuất máy": xóa đăng nhập + dữ liệu trang của hồ sơ quản trị (hồ sơ mặc định do MainActivity xóa). */
        fun xoaPhien() {
            if (!hoTroHoSoRieng()) return
            val hoSo = ProfileStore.getInstance().getOrCreateProfile(HO_SO)
            hoSo.cookieManager.removeAllCookies(null)
            hoSo.cookieManager.flush()
            hoSo.webStorage.deleteAllData()
        }
    }

    private fun hoSo() = ProfileStore.getInstance().getOrCreateProfile(HO_SO)

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val slug = intent.getStringExtra(THEM_SLUG)
        if (slug == null || !hoTroHoSoRieng()) return finish()
        val dichDau = "$apiBase/r/$slug/admin/login?chi-quan-tri=1"

        WindowCompat.setDecorFitsSystemWindows(window, false)
        val goc = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        goc.addView(taoThanhTren(intent.getStringExtra(THEM_TEN) ?: ""))
        web = WebView(this)
        // Hồ sơ phải gắn TRƯỚC mọi thao tác khác trên WebView.
        WebViewCompat.setProfile(web, HO_SO)
        goc.addView(web, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        ViewCompat.setOnApplyWindowInsetsListener(goc) { v, insets ->
            val he = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val phim = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(he.left, he.top, he.right, maxOf(he.bottom, phim.bottom))
            insets
        }
        setContentView(goc)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            // "In mã QR", "Xem thực đơn" (tab mới) mở ngay trong khung này, cùng hồ sơ — Back để quay lại.
            setSupportMultipleWindows(false)
            userAgentString = "$userAgentString TechMenuAndroid/${BuildConfig.VERSION_NAME}"
        }
        hoSo().cookieManager.setAcceptCookie(true)
        // Màn "mất mạng" của app chỉ cần lệnh thuLai — chỉ trang của app được gọi (lọc nguồn).
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "TechMenuAndroid", setOf(MainActivity.NGUON_APP)) { _, msg, nguon, khungChinh, tra ->
                if (!khungChinh || nguon.toString().trimEnd('/') != MainActivity.NGUON_APP) return@addWebMessageListener
                val m = try { JSONObject(msg.data ?: "") } catch (_: Exception) { return@addWebMessageListener }
                tra.postMessage(JSONObject().put("id", m.optInt("id")).put("ketQua", JSONObject.NULL).toString())
                if (m.optString("lenh") == "thuLai") {
                    val dich = m.optJSONArray("thamSo")?.optString(0) ?: ""
                    web.loadUrl(if (dich.startsWith("$nguonApi/")) dich else dichDau)
                }
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(req.url)

            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val u = req.url
                val nguon = "${u.scheme}://${u.authority}"
                if (nguon == nguonApi || nguon == MainActivity.NGUON_APP) return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, u))
                } catch (_: ActivityNotFoundException) {
                }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                hoSo().cookieManager.flush() // giữ đăng nhập quản trị khi app bị tắt hẳn
            }

            override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                if (req.isForMainFrame && req.url.toString().startsWith(nguonApi)) {
                    view.loadUrl(MainActivity.TRANG + "mat-mang.html?dich=" + Uri.encode(req.url.toString()))
                }
            }
        }
        web.setDownloadListener { url, ua, noiDungTep, mime, _ -> taiTep(url, ua, noiDungTep, mime) }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })
        web.loadUrl(dichDau)
    }

    override fun onPause() {
        super.onPause()
        if (::web.isInitialized) hoSo().cookieManager.flush()
    }

    override fun onDestroy() {
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }

    /** Thanh trên: "← Về Thu ngân" + "Quản trị — {tên quán}" (Giao diện A2'). */
    private fun taoThanhTren(tenQuan: String): LinearLayout {
        val thanh = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(ContextCompat.getColor(this@QuanTriActivity, R.color.cream))
            minimumHeight = dp(48)
        }
        thanh.addView(TextView(this).apply {
            text = "← Về Thu ngân"
            textSize = 15f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(ContextCompat.getColor(this@QuanTriActivity, R.color.primary_deep))
            minHeight = dp(48)
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), 0, dp(16), 0)
            setBackgroundResource(android.R.drawable.list_selector_background)
            contentDescription = "Về màn Thu ngân"
            setOnClickListener { finish() }
        })
        thanh.addView(TextView(this).apply {
            text = "Quản trị — $tenQuan"
            textSize = 15f
            maxLines = 1
            setTextColor(ContextCompat.getColor(this@QuanTriActivity, R.color.ink))
            setPadding(dp(8), 0, dp(16), 0)
        })
        return thanh
    }

    /** Xuất Excel / PDF từ admin → thư mục Tải xuống (Giao diện A5). Cookie lấy từ hồ sơ quản trị (route xuất cần đăng nhập). */
    private fun taiTep(url: String, ua: String, noiDungTep: String?, mime: String?) {
        if (!TaiTep.coQuyen(this)) {
            // Android 8–9: lưu vào Tải xuống cần quyền — xin rồi tải tiếp khi được cho phép.
            choTai = Runnable { taiTep(url, ua, noiDungTep, mime) }
            TaiTep.xinQuyen(this)
            return
        }
        TaiTep.tai(this, hoSo().cookieManager, url, ua, noiDungTep, mime)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != TaiTep.MA_XIN_QUYEN) return
        val tiep = choTai
        choTai = null
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) tiep?.run()
        else Toast.makeText(this, "Chưa cho phép lưu tệp — không tải được.", Toast.LENGTH_LONG).show()
    }

    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()
}
