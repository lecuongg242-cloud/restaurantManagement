/**
 * Thông báo khi lời gọi KHÔNG tới được server (mất mạng, server ngủ, máy POS rớt wifi giữa ca).
 *
 * Server action mà ném thì `await` ở client nhận promise reject: dòng `setBusy(false)` nằm sau
 * `await` không bao giờ chạy ⇒ nút kẹt spinner vĩnh viễn, không một chữ báo lỗi. Gom câu chữ về
 * một chỗ để mọi màn POS nói cùng một giọng, thay vì mỗi nơi bịa một kiểu.
 *
 * Cùng họ với `PAY_OFFLINE_MSG` (PaymentDialog) và `HISTORY_OFFLINE_MSG` (TakeawayHistory) — hai
 * cái đó ở lại chỗ cũ vì câu chữ riêng: một cái có tiền của khách đang treo, một cái chỉ là lỗi đọc.
 */

/** Mặc định cho mọi thao tác đổi dữ liệu: nói rõ là CHƯA chạy, và việc cần làm là thử lại. */
export const ACTION_OFFLINE_MSG = "Mất kết nối — thao tác chưa chạy. Kiểm tra mạng rồi thử lại.";

/**
 * Riêng cho việc GỬI ĐƠN. Phải viết hoa "CHƯA" như `PAY_OFFLINE_MSG`: nhân viên đứng cạnh bàn,
 * tưởng đơn đã sang bếp mà thật ra chưa, thì khách ngồi chờ món không bao giờ tới.
 */
export const ORDER_OFFLINE_MSG = "Mất kết nối — đơn CHƯA được gửi. Kiểm tra mạng rồi bấm gửi lại.";

/**
 * Khi một nút gom NHIỀU thao tác vào cùng một đường (xem `runBillAction` ở PosBoard), thông báo
 * chung "thao tác chưa chạy" làm mất ngữ cảnh — nhân viên không biết vừa hỏng chia bill, gộp bàn
 * hay giảm giá. Đây là đường tiền nên phải gọi đúng tên việc.
 *
 * `what` là cụm động từ tiếng Việt, viết thường: "chia hóa đơn", "gộp bàn"…
 */
export const offlineMsg = (what: string) =>
  `Mất kết nối — chưa ${what}. Kiểm tra mạng rồi thử lại.`;
