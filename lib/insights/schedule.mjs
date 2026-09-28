/**
 * Lịch rải nhận xét tuần (P18 18-03, QD-025 D8): mỗi quán ĐÚNG MỘT nhận xét cho mỗi tuần, số lần gọi AI mỗi đêm không
 * vượt ngưỡng. Đêm thứ Hai (tuần vừa hết) làm trước; quán nào chưa tới lượt thì các đêm sau trong tuần làm tiếp — xếp
 * theo `tenant_id` để thứ tự cố định. "Đã có nhận xét tuần này" do database chặn (index duy nhất tenant + tuần), nên
 * chạy lại job cũng không gọi AI hai lần cho một quán.
 *
 * @param {string[]} tenantIds quán đủ điều kiện nhận xét tuần này
 * @param {Set<string>} daCo quán đã có nhận xét của tuần này
 * @param {number} toiDaMoiDem
 * @returns {string[]} quán làm trong đêm nay
 */
export function chonQuanDem(tenantIds, daCo, toiDaMoiDem) {
  return [...tenantIds]
    .filter((id) => !daCo.has(id))
    .sort()
    .slice(0, Math.max(0, toiDaMoiDem));
}
