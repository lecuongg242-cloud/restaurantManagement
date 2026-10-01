package vn.techmenu.thungan

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Bật lại cầu in sau khi khởi động máy / sau khi app tự cập nhật (24-03) — như app Windows tự chạy cùng Windows: quán mất
 * điện bật lại tablet mà chưa ai mở app thì phiếu bếp vẫn ra. Chỉ máy đã kích hoạt "Có — máy quầy".
 */
class KhoiDongMay : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (CauHinhKho(ctx).doc()?.coMayIn == true) CauInDichVu.batDau(ctx)
    }
}
