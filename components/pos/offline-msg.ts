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

/**
 * Mặc định cho mọi thao tác đổi dữ liệu CHƯA có khóa idempotent (duyệt đơn, hủy món, chia/gộp hóa
 * đơn, đặt bàn…). Câu chữ giữ nguyên "chưa chạy" dù đó cũng là một khẳng định không chắc: đổi nó
 * thành "chưa rõ" mà không kèm lớp chống trùng thì chỉ là mời người dùng bấm lại một thao tác chưa
 * an toàn. Chỗ nào được cấp khóa thì mới đổi câu (xem `ORDER_OFFLINE_MSG`).
 */
export const ACTION_OFFLINE_MSG = "Mất kết nối — thao tác chưa chạy. Kiểm tra mạng rồi thử lại.";

/**
 * Riêng cho việc GỬI ĐƠN.
 *
 * Bản cũ viết "đơn CHƯA được gửi" — một lời KHẲNG ĐỊNH mà hệ thống không có cơ sở để nói. Mất phản
 * hồi thì máy POS không biết server đã nhận hay chưa: đơn có thể đã commit xong rồi mạng mới đứt.
 * Câu đó vừa sai vừa nguy hiểm theo cả hai chiều — tin nó thì bấm lại và đẻ đơn trùng; không tin nó
 * thì không dám bấm và khách ngồi chờ món không bao giờ tới.
 *
 * Nay khóa idempotent (0034) làm lượt bấm lại AN TOÀN, nên câu đúng là nói thật cái mình không biết
 * rồi chỉ đúng việc cần làm: cứ bấm gửi lại.
 */
export const ORDER_OFFLINE_MSG =
  "Mất kết nối — chưa rõ đơn đã gửi được chưa. Kiểm tra mạng rồi bấm gửi lại: gửi lại không tạo đơn trùng.";

/**
 * Khi một nút gom NHIỀU thao tác vào cùng một đường (xem `runBillAction` ở PosBoard), thông báo
 * chung "thao tác chưa chạy" làm mất ngữ cảnh — nhân viên không biết vừa hỏng chia bill, gộp bàn
 * hay giảm giá. Đây là đường tiền nên phải gọi đúng tên việc.
 *
 * `what` là cụm động từ tiếng Việt, viết thường: "chia hóa đơn", "gộp bàn"…
 */
export const offlineMsg = (what: string) =>
  `Mất kết nối — chưa ${what}. Kiểm tra mạng rồi thử lại.`;
