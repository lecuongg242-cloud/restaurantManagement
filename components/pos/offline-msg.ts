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
 * Bản thay thế đầu tiên hứa "gửi lại không tạo đơn trùng" — cũng sai, chỉ ngược chiều: lời hứa đó
 * chỉ đúng khi nhân viên bấm lại mà KHÔNG sửa giỏ (sửa giỏ ⇒ khóa mới ⇒ đơn mới, đúng thiết kế).
 * Hứa tuyệt đối lại còn mời gọi đúng cái hành vi phá vỡ lời hứa.
 *
 * Câu hiện tại chỉ nói cái đang thấy và việc nên làm. Lớp chống trùng (0034) im lặng làm việc của
 * nó — người dùng không cần biết tên nó, chỉ cần biết bấm lại là hành động đúng.
 */
export const ORDER_OFFLINE_MSG =
  "Mất kết nối — chưa rõ đơn đã gửi được chưa. Kiểm tra mạng rồi bấm gửi lại; đừng sửa giỏ trước khi gửi lại.";

/**
 * Khi một nút gom NHIỀU thao tác vào cùng một đường (xem `runBillAction` ở PosBoard), thông báo
 * chung "thao tác chưa chạy" làm mất ngữ cảnh — nhân viên không biết vừa hỏng chia bill, gộp bàn
 * hay giảm giá. Đây là đường tiền nên phải gọi đúng tên việc.
 *
 * `what` là cụm động từ tiếng Việt, viết thường: "chia hóa đơn", "gộp bàn"…
 */
export const offlineMsg = (what: string) =>
  `Mất kết nối — chưa ${what}. Kiểm tra mạng rồi thử lại.`;
