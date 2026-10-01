package vn.techmenu.thungan

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.view.WindowManager
import androidx.core.app.ActivityCompat
import androidx.core.content.FileProvider
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.google.android.material.bottomsheet.BottomSheetDialog
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Màn duy nhất của app (P24 24-01, QD-030 D1): WebView mở CHÍNH trang POS / Màn bếp trên máy chủ + nút ☰ nổi mở menu
 * của app. Trang của app (đăng nhập, cài đặt máy in, mất mạng) là trang của app Windows, phục vụ cục bộ qua TrangCuaApp.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var nutMenu: ImageButton
    private lateinit var kho: CauHinhKho
    private var cauHinh: CauHinh? = null
    private var kichBanThongTin: ScriptHandler? = null
    private val nen = Executors.newSingleThreadExecutor()

    // Tự cập nhật (24-02): bản mới đã tải xong + lần thao tác cuối + "Để sau" tới lúc nào.
    private val capNhat by lazy { CapNhat(this, BuildConfig.CAP_NHAT_BASE) }
    private var banMoi: CapNhat.BanMoi? = null
    private var lanThaoTacCuoi = SystemClock.elapsedRealtime()
    private var hoanDen = 0L
    private var dangHoiCapNhat = false
    private var choCaiSauKhiCapQuyen = false
    private val dongHo = Handler(Looper.getMainLooper())

    private val apiBase = BuildConfig.API_BASE
    private val nguonApi: String = Uri.parse(apiBase).let { "${it.scheme}://${it.authority}" }

    private val loader by lazy {
        WebViewAssetLoader.Builder().addPathHandler("/assets/", TrangCuaApp(this)).build()
    }

    companion object {
        const val NGUON_APP = "https://appassets.androidplatform.net"
        const val TRANG = "$NGUON_APP/assets/trang/"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        kho = CauHinhKho(this)
        cauHinh = kho.doc()

        // Android 15 bắt vẽ tràn viền ⇒ tự chừa thanh trạng thái / thanh điều hướng / bàn phím cho mọi bản Android.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val goc = FrameLayout(this)
        web = WebView(this)
        goc.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        nutMenu = taoNutMenu()
        goc.addView(nutMenu, FrameLayout.LayoutParams(dp(48), dp(48)).apply { gravity = Gravity.TOP or Gravity.START })
        ViewCompat.setOnApplyWindowInsetsListener(goc) { v, insets ->
            val he = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val phim = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(he.left, he.top, he.right, maxOf(he.bottom, phim.bottom))
            insets
        }
        setContentView(goc)

        caiWebView()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack()
                else AlertDialog.Builder(this@MainActivity)
                    .setMessage("Thoát TechMenu?")
                    .setPositiveButton("Thoát") { _, _ -> finish() }
                    .setNegativeButton("Ở lại", null)
                    .show()
            }
        })
        goc.post { datViTriNut(layViTriNut()) }
        moDau()
        batTuCapNhat()
        if (cauHinh?.coMayIn == true) {
            CauInDichVu.batDau(this)
            apDungGiuSang()
        }
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        lanThaoTacCuoi = SystemClock.elapsedRealtime()
    }

    override fun onResume() {
        super.onResume()
        // Vừa bật "Cho phép từ nguồn này" trong Cài đặt Android rồi quay lại ⇒ cài luôn, không bắt bấm lại.
        if (choCaiSauKhiCapQuyen && packageManager.canRequestPackageInstalls()) {
            choCaiSauKhiCapQuyen = false
            caiBanMoi()
        }
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush() // giữ phiên đăng nhập nhân viên khi app bị tắt hẳn
    }

    override fun onDestroy() {
        dongHo.removeCallbacksAndMessages(null)
        nen.shutdownNow()
        super.onDestroy()
    }

    // ── WebView ────────────────────────────────────────────────────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun caiWebView() {
        // Chỉ bản debug: cho công cụ thử (Playwright qua cổng gỡ lỗi) điều khiển trang. Bản phát hành KHÔNG bật.
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false // chuông đơn mới trên POS
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            userAgentString = "$userAgentString TechMenuAndroid/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().setAcceptCookie(true)

        // Lệnh có quyền CHỈ cho trang của app — lọc theo nguồn ở tầng WebView, và kiểm lại nguồn ở mỗi lời gọi.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "TechMenuAndroid", setOf(NGUON_APP)) { _, msg, nguon, khungChinh, tra ->
                if (khungChinh && nguon.toString().trimEnd('/') == NGUON_APP) xuLyLenh(msg.data ?: "", tra)
            }
        }
        capNhatThongTinApp()

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(req.url)

            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val u = req.url
                val nguon = "${u.scheme}://${u.authority}"
                if (nguon == nguonApi || nguon == NGUON_APP) return false
                // Liên kết ra ngoài (Zalo, bản đồ, tel:…) → ứng dụng khác / trình duyệt, không mở trong khung POS.
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, u))
                } catch (_: ActivityNotFoundException) {
                }
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                val laTrangWeb = url.startsWith(nguonApi)
                nutMenu.visibility = if (laTrangWeb && cauHinh != null) View.VISIBLE else View.GONE
                // WebView cũ chưa có "chạy trước khi trang chạy": gắn thông tin app ngay đầu trang (POS chỉ đọc lúc in).
                if (laTrangWeb && kichBanThongTin == null) view.evaluateJavascript(maThongTinApp(), null)
            }

            override fun onPageFinished(view: WebView, url: String) {
                // WebView chỉ ghi cookie xuống đĩa theo chu kỳ: nhân viên vừa đăng nhập mà máy tắt / app bị hệ thống dừng
                // là mất phiên (đo trên máy ảo: force-stop ngay sau đăng nhập ⇒ mở lại ra màn đăng nhập). Ghi sau mỗi trang.
                CookieManager.getInstance().flush()
            }

            // Đăng nhập POS chuyển trang phía trình duyệt (Next.js) — không qua onPageFinished, nhưng có qua đây.
            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                CookieManager.getInstance().flush()
            }

            override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                // Khung chính của POS / Màn bếp tải hỏng ⇒ màn "Chưa kết nối được" (của app Windows), tự thử lại.
                if (req.isForMainFrame && req.url.toString().startsWith(nguonApi)) {
                    view.loadUrl(TRANG + "mat-mang.html?dich=" + Uri.encode(req.url.toString()))
                }
            }
        }
    }

    /** `window.techmenuDesktop` cho trang POS — cùng dữ liệu preload.cjs của app Windows (lib/print/device.ts đọc). */
    private fun maThongTinApp(): String {
        val coCauIn = cauHinh?.coMayIn == true
        return "window.techmenuDesktop=Object.freeze({phienBan:${JSONObject.quote(BuildConfig.VERSION_NAME)}," +
            "coCauIn:$coCauIn,nenTang:\"android\"});"
    }

    private fun capNhatThongTinApp() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        kichBanThongTin?.remove()
        kichBanThongTin = WebViewCompat.addDocumentStartJavaScript(web, maThongTinApp(), setOf(nguonApi))
    }

    private fun moDau() {
        val c = cauHinh
        if (c == null) web.loadUrl(TRANG + "kich-hoat.html") else web.loadUrl(c.duongDan())
    }

    private fun moManHinh() {
        val c = cauHinh ?: return moDau()
        web.loadUrl(c.duongDan())
    }

    // ── Lệnh từ trang của app (cau-noi-android.js) ────────────────────────────────────────────────────────────────

    private fun xuLyLenh(du: String, tra: JavaScriptReplyProxy) {
        val m = try {
            JSONObject(du)
        } catch (_: Exception) {
            return
        }
        val id = m.optInt("id")
        val thamSo = m.optJSONArray("thamSo") ?: JSONArray()
        fun traLoi(ketQua: Any?) {
            tra.postMessage(JSONObject().put("id", id).put("ketQua", ketQua ?: JSONObject.NULL).toString())
        }
        when (m.optString("lenh")) {
            "kichHoat" -> {
                val vao = thamSo.optJSONObject(0) ?: JSONObject()
                nen.execute {
                    val kq = KichHoat.goi(apiBase, vao) { moi -> kho.ghi(moi) }
                    runOnUiThread {
                        traLoi(kq)
                        if (kq.optBoolean("ok")) {
                            cauHinh = kho.doc()
                            capNhatThongTinApp()
                            if (cauHinh?.coMayIn == true) {
                                // Như app Windows: kích hoạt máy quầy xong ⇒ cài máy in ngay; bật dịch vụ in + xin quyền.
                                CauInDichVu.batDau(this)
                                xinQuyenChayNen()
                                web.loadUrl(TRANG + "cai-dat-may-in.html?lanDau=1")
                            } else {
                                moManHinh()
                            }
                        }
                    }
                }
            }
            // Máy in (24-03). Máy "chỉ xem" ⇒ docMayIn null ⇒ trang tự quay về màn chính (như app Windows).
            "docMayIn" -> {
                val c = cauHinh
                traLoi(
                    if (c == null || !c.coMayIn) null
                    else JSONObject().put("mayIn", c.mayIn).put("usb", JSONArray()).put("tenantName", c.tenantName)
                        .put("nenTang", "android")
                )
            }
            "doMayInLan" -> nen.execute {
                val ds = MayInLan.do9100()
                runOnUiThread { traLoi(JSONArray(ds)) }
            }
            "inThu" -> {
                val nhap = thamSo.optJSONObject(0)
                val vai = if (thamSo.optString(1) == "quay") "quay" else "bep"
                val may = chuanHoaMayIn(nhap?.optJSONObject(vai))
                if (cauHinh?.coMayIn != true) traLoi(JSONObject().put("ok", false).put("thongDiep", "Máy này không in."))
                else if (may == null) traLoi(JSONObject().put("ok", false).put("thongDiep", "Chưa nhập máy in hợp lệ."))
                else nen.execute {
                    val kq = try {
                        MayInLan.guiCoThuLai(EscPos.phieuThu(EscPos.soKyTu(nhap?.optString("kho") ?: "80"), vai), may.optString("host"), may.optInt("port"), 0)
                        JSONObject().put("ok", true)
                    } catch (e: Exception) {
                        JSONObject().put("ok", false).put("thongDiep", "không kết nối được ${may.optString("host")}:${may.optInt("port")} (${e.message ?: "lỗi"})")
                    }
                    runOnUiThread { traLoi(kq) }
                }
            }
            "luuMayIn" -> {
                val c = cauHinh
                val nhap = thamSo.optJSONObject(0)
                if (c == null || !c.coMayIn || nhap == null) traLoi(JSONObject().put("ok", false))
                else {
                    val mayIn = JSONObject()
                        .put("bep", chuanHoaMayIn(nhap.optJSONObject("bep")) ?: JSONObject.NULL)
                        .put("quay", chuanHoaMayIn(nhap.optJSONObject("quay")) ?: JSONObject.NULL)
                        .put("kho", if (nhap.optString("kho") == "58") "58" else "80")
                        .put("giuSang", nhap.optBoolean("giuSang"))
                    val moi = c.copy(mayIn = mayIn)
                    kho.ghi(moi)
                    cauHinh = moi
                    apDungGiuSang()
                    // Vòng in đọc cấu hình lúc khởi động ⇒ khởi động lại để dùng máy in mới.
                    CauInDichVu.dungLai(this)
                    CauInDichVu.batDau(this)
                    traLoi(JSONObject().put("ok", true))
                }
            }
            "moManHinh" -> {
                traLoi(null)
                moManHinh()
            }
            "thuLai" -> {
                traLoi(null)
                val dich = thamSo.optString(0)
                if (dich.startsWith("$nguonApi/")) web.loadUrl(dich) else moManHinh()
            }
            else -> traLoi(null)
        }
    }

    // ── Tự cập nhật (24-02, ANDR-04) ──────────────────────────────────────────────────────────────────────────────

    private fun batTuCapNhat() {
        val kiem = object : Runnable {
            override fun run() {
                nen.execute {
                    val ban = capNhat.kiemVaTai()
                    runOnUiThread { if (ban != null) banMoi = ban }
                }
                dongHo.postDelayed(this, CapNhat.KIEM_MOI_MS)
            }
        }
        dongHo.post(kiem)
        // Mỗi 30 giây xem máy đã để yên đủ lâu chưa (cùng luật app Windows) — có bản mới thì hỏi.
        val xem = object : Runnable {
            override fun run() {
                val yen = (SystemClock.elapsedRealtime() - lanThaoTacCuoi) / 1000
                if (!dangHoiCapNhat && SystemClock.elapsedRealtime() >= hoanDen &&
                    CapNhat.duocHoi(banMoi != null, yen)
                ) hoiCapNhat()
                dongHo.postDelayed(this, 30_000)
            }
        }
        dongHo.postDelayed(xem, 30_000)
    }

    private fun hoiCapNhat() {
        val ban = banMoi ?: return
        dangHoiCapNhat = true
        AlertDialog.Builder(this)
            .setTitle("Có bản mới ${ban.phienBan}")
            .setMessage("Cập nhật mất khoảng 1 phút. Đăng nhập và cài đặt máy in được giữ nguyên.")
            .setPositiveButton("Cập nhật") { _, _ -> caiBanMoi() }
            .setNegativeButton("Để sau") { _, _ -> hoanDen = SystemClock.elapsedRealtime() + CapNhat.KIEM_MOI_MS }
            .setOnDismissListener { dangHoiCapNhat = false }
            .show()
    }

    private fun caiBanMoi() {
        val ban = banMoi ?: return
        if (!ban.tep.exists()) {
            banMoi = null
            return
        }
        // Lần đầu: Android bắt người dùng tự bật "Cho phép từ nguồn này" cho app — mở đúng màn đó, quay lại là cài.
        if (!packageManager.canRequestPackageInstalls()) {
            choCaiSauKhiCapQuyen = true
            Toast.makeText(this, "Bật \"Cho phép từ nguồn này\" rồi quay lại để cập nhật.", Toast.LENGTH_LONG).show()
            startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
            return
        }
        CookieManager.getInstance().flush()
        val uri = FileProvider.getUriForFile(this, "$packageName.cap-nhat", ban.tep)
        startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }

    // ── Nút ☰ nổi + menu (Giao diện #4 — chủ dự án chọn nút nổi) ───────────────────────────────────────────────────

    @SuppressLint("ClickableViewAccessibility")
    private fun taoNutMenu(): ImageButton {
        val nut = ImageButton(this)
        nut.setImageResource(R.drawable.ic_menu)
        nut.background = ContextCompat.getDrawable(this, R.drawable.nut_menu_nen)
        nut.alpha = 0.85f
        nut.contentDescription = "Menu TechMenu"
        nut.visibility = View.GONE
        val nguong = ViewConfiguration.get(this).scaledTouchSlop
        var batDauY = 0f
        var yNut = 0f
        var dangKeo = false
        nut.setOnTouchListener { v, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    batDauY = e.rawY; yNut = v.y; dangKeo = false
                }
                MotionEvent.ACTION_MOVE -> {
                    val dy = e.rawY - batDauY
                    if (!dangKeo && kotlin.math.abs(dy) > nguong) dangKeo = true
                    if (dangKeo) v.y = gioiHanY(yNut + dy)
                }
                MotionEvent.ACTION_UP -> {
                    if (dangKeo) luuViTriNut() else moMenu()
                }
            }
            true
        }
        return nut
    }

    private fun gioiHanY(y: Float): Float {
        val cha = nutMenu.parent as View
        val tren = cha.paddingTop.toFloat()
        val duoi = (cha.height - cha.paddingBottom - nutMenu.height).toFloat()
        return y.coerceIn(tren, maxOf(tren, duoi))
    }

    /** Vị trí nút lưu theo tỉ lệ chiều cao — xoay màn / đổi máy vẫn đúng chỗ. Mặc định giữa mép trái. */
    private fun layViTriNut() = getSharedPreferences("giao-dien", MODE_PRIVATE).getFloat("viTriNut", 0.5f)

    private fun datViTriNut(tiLe: Float) {
        val cha = nutMenu.parent as View
        val tren = cha.paddingTop
        val khoang = cha.height - cha.paddingTop - cha.paddingBottom - nutMenu.height
        nutMenu.x = (cha.paddingLeft + dp(4)).toFloat()
        nutMenu.y = gioiHanY(tren + khoang * tiLe)
    }

    private fun luuViTriNut() {
        val cha = nutMenu.parent as View
        val khoang = (cha.height - cha.paddingTop - cha.paddingBottom - nutMenu.height).coerceAtLeast(1)
        val tiLe = ((nutMenu.y - cha.paddingTop) / khoang).coerceIn(0f, 1f)
        getSharedPreferences("giao-dien", MODE_PRIVATE).edit().putFloat("viTriNut", tiLe).apply()
    }

    private fun moMenu() {
        val c = cauHinh ?: return
        val hop = BottomSheetDialog(this)
        val ds = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(8), 0, dp(16))
        }
        fun muc(chu: String, lam: () -> Unit) {
            ds.addView(TextView(this).apply {
                text = chu
                textSize = 17f
                setTextColor(ContextCompat.getColor(this@MainActivity, R.color.ink))
                minHeight = dp(52)
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(24), 0, dp(24), 0)
                setBackgroundResource(android.R.drawable.list_selector_background)
                setOnClickListener {
                    hop.dismiss()
                    lam()
                }
            })
        }
        ds.addView(TextView(this).apply {
            text = c.tenantName
            textSize = 14f
            setPadding(dp(24), dp(8), dp(24), dp(8))
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.primary_deep))
        })
        muc((if (c.manHinh == "pos") "✓ " else "") + "Thu ngân") { doiManHinh("pos") }
        muc((if (c.manHinh == "kds") "✓ " else "") + "Màn bếp") { doiManHinh("kds") }
        muc("Cài đặt máy in") {
            if (c.coMayIn) web.loadUrl(TRANG + "cai-dat-may-in.html")
            else Toast.makeText(this, "Máy này ở chế độ chỉ xem — không in.", Toast.LENGTH_LONG).show()
        }
        muc("Tải lại") { web.reload() }
        banMoi?.let { b -> muc("Cập nhật lên bản ${b.phienBan}") { caiBanMoi() } }
        if (c.nhieuChiNhanh) muc("Đổi chi nhánh") { hoiDangXuat("Đổi chi nhánh? Phải đăng nhập lại bằng tài khoản chủ quán.") }
        muc("Đăng xuất máy") { hoiDangXuat("Đăng xuất máy này? Phải đăng nhập lại bằng tài khoản chủ quán.") }
        ds.addView(TextView(this).apply {
            text = "Phiên bản ${BuildConfig.VERSION_NAME}"
            textSize = 12f
            setPadding(dp(24), dp(12), dp(24), 0)
        })
        hop.setContentView(ds)
        // Mở HẾT ngay: mặc định tấm chỉ ló phần đầu, trên tablet còn bị thanh tác vụ che — người dùng thấy mỗi tên quán.
        hop.behavior.skipCollapsed = true
        hop.behavior.state = com.google.android.material.bottomsheet.BottomSheetBehavior.STATE_EXPANDED
        hop.show()
    }

    private fun doiManHinh(man: String) {
        val c = cauHinh ?: return
        val moi = c.copy(manHinh = man)
        kho.ghi(moi)
        cauHinh = moi
        web.loadUrl(moi.duongDan())
    }

    private fun hoiDangXuat(cau: String) {
        AlertDialog.Builder(this)
            .setMessage(cau)
            .setPositiveButton("Đăng xuất") { _, _ -> dangXuat() }
            .setNegativeButton("Hủy", null)
            .show()
    }

    private fun dangXuat() {
        CauInDichVu.dungLai(this)
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        kho.xoa()
        cauHinh = null
        capNhatThongTinApp()
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
        WebStorage.getInstance().deleteAllData()
        web.clearCache(true)
        web.loadUrl(TRANG + "kich-hoat.html")
        web.clearHistory()
    }

    // ── Máy in (24-03) ────────────────────────────────────────────────────────────────────────────────────────────

    /** Kiểm một máy in từ trang Cài đặt máy in — cùng luật `chuanHoaMayIn` của app Windows; Android chỉ có LAN. */
    private fun chuanHoaMayIn(m: JSONObject?): JSONObject? {
        if (m == null || m.optString("kieu") != "lan") return null
        val host = m.optString("host").trim()
        val port = m.optInt("port", 9100)
        if (!Regex("^[0-9a-zA-Z.-]{1,100}$").matches(host) || port !in 1..65535) return null
        return JSONObject().put("kieu", "lan").put("host", host).put("port", port)
    }

    private fun apDungGiuSang() {
        if (cauHinh?.mayIn?.optBoolean("giuSang") == true) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    /** Giao diện #9: thông báo thường trực cần quyền (Android 13+); in liên tục cần bỏ tối ưu pin. */
    private fun xinQuyenChayNen() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            AlertDialog.Builder(this)
                .setTitle("Cho TechMenu chạy nền để in liên tục")
                .setMessage("Android có thể tắt app khi màn hình tắt để tiết kiệm pin — phiếu bếp sẽ không ra. Bấm \"Cho phép\" ở màn tiếp theo.")
                .setPositiveButton("Tiếp tục") { _, _ ->
                    @SuppressLint("BatteryLife")
                    val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
                    try {
                        startActivity(i)
                    } catch (_: ActivityNotFoundException) {
                    }
                }
                .setNegativeButton("Để sau", null)
                .show()
        }
    }

    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()
}
