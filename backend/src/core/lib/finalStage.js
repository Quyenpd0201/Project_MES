// Công đoạn CUỐI của lệnh (cho task alias `t`): có công đoạn Cắt → 'Cắt', chỉ có Thổi → 'Thổi'.
// Thành phẩm / "đã sản xuất" chỉ tính ở công đoạn cuối, tránh đếm 2 lần Thổi + Cắt.
const FINAL_STAGE_OF_TASK = `(CASE WHEN EXISTS (SELECT 1 FROM production_tasks tf
                                       WHERE tf.production_order_id = t.production_order_id AND tf.stage = 'Cắt')
                          THEN 'Cắt' ELSE 'Thổi' END)`;

module.exports = { FINAL_STAGE_OF_TASK };
