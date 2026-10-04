package vn.techmenu.thungan

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * App "TechMenu Quản lý" (P30 30-03, MGR-07, QD-033 D2/D6, Giao diện B11): MỘT màn WebView toàn màn hình mở `/quan-ly`
 * trên máy chủ — giao diện ở web (30-02), sửa không cần phát hành app. Nhớ đăng nhập (cookie), liên kết ngoài mở trình
 * duyệt, mất mạng → màn "Chưa kết nối được" của app Thu ngân, Xuất Excel → Tải xuống, tự cập nhật như app Thu ngân.
 * Không cầu in, không chạy nền.
 */
class QuanLyActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private val nen = Executors.newSingleThreadExecutor()
    private val tuCapNhat by lazy { TuCapNhat(this, nen) }
    private val apiBase = BuildConfig.API_BASE
    private val nguonApi: String = Uri.parse(apiBase).let { "${it.scheme}://${it.authority}" }
    private val dau = "$apiBase/quan-ly"
    private val loader by lazy { WebViewAssetLoader.Builder().addPathHandler("/assets/", TrangCuaApp(this)).build() }
    private var choTai: Runnable? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val goc = FrameLayout(this)
        web = WebView(this)
        goc.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        ViewCompat.setOnApplyWindowInsetsListener(goc) { v, insets ->
            val he = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val phim = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(he.left, he.top, he.right, maxOf(he.bottom, phim.bottom))
            insets
        }
        setContentView(goc)

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            // Trang "Thêm" đọc phiên bản app từ đây (components/quan-ly/ThietBi.tsx).
            userAgentString = "$userAgentString TechMenuQuanLy/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        // Màn "mất mạng" của app chỉ cần lệnh thuLai — chỉ trang của app được gọi (lọc nguồn).
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "TechMenuAndroid", setOf(NGUON_APP)) { _, msg, nguon, khungChinh, tra ->
                if (!khungChinh || nguon.toString().trimEnd('/') != NGUON_APP) return@addWebMessageListener
                val m = try { JSONObject(msg.data ?: "") } catch (_: Exception) { return@addWebMessageListener }
                tra.postMessage(JSONObject().put("id", m.optInt("id")).put("ketQua", JSONObject.NULL).toString())
                if (m.optString("lenh") == "thuLai") {
                    val dich = m.optJSONArray("thamSo")?.optString(0) ?: ""
                    web.loadUrl(if (dich.startsWith("$nguonApi/")) dich else dau)
                }
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(req.url)

            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val u = req.url
                val nguon = "${u.scheme}://${u.authority}"
                if (nguon == nguonApi || nguon == NGUON_APP) return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, u))
                } catch (_: ActivityNotFoundException) {
                }
                return true
            }

            // WebView chỉ ghi cookie xuống đĩa theo chu kỳ — ghi sau mỗi trang để tắt hẳn app không mất đăng nhập.
            override fun onPageFinished(view: WebView, url: String) = CookieManager.getInstance().flush()

            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) = CookieManager.getInstance().flush()

            override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                if (req.isForMainFrame && req.url.toString().startsWith(nguonApi)) {
                    view.loadUrl(TRANG + "mat-mang.html?dich=" + Uri.encode(req.url.toString()))
                }
            }
        }
        web.setDownloadListener { url, ua, noiDungTep, mime, _ -> taiTep(url, ua, noiDungTep, mime) }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })
        if (savedInstanceState == null) web.loadUrl(dau) else web.restoreState(savedInstanceState)
        tuCapNhat.batDau()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        tuCapNhat.thaoTac()
    }

    override fun onResume() {
        super.onResume()
        tuCapNhat.tiepTuc()
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        tuCapNhat.dung()
        nen.shutdownNow()
        web.destroy()
        super.onDestroy()
    }

    private fun taiTep(url: String, ua: String, noiDungTep: String?, mime: String?) {
        if (!TaiTep.coQuyen(this)) {
            choTai = Runnable { taiTep(url, ua, noiDungTep, mime) }
            TaiTep.xinQuyen(this)
            return
        }
        TaiTep.tai(this, CookieManager.getInstance(), url, ua, noiDungTep, mime)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != TaiTep.MA_XIN_QUYEN) return
        val tiep = choTai
        choTai = null
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) tiep?.run()
        else Toast.makeText(this, "Chưa cho phép lưu tệp — không tải được.", Toast.LENGTH_LONG).show()
    }

    companion object {
        const val NGUON_APP = MainActivity.NGUON_APP
        const val TRANG = MainActivity.TRANG
    }
}
