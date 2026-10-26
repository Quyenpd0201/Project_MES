-- [HR-G1] Module Chấm công — 2026-10-22, CHƯA PHÁT HÀNH (file mới)
-- =====================================================================
-- XEM TRƯỚC (CHỈ ĐỌC — không sửa gì): nhân viên sẽ được gán vào đơn vị nào (HR G1, mục 26h)
-- Chạy trên PRD: Supabase → SQL Editor → dán toàn bộ file → Run.
-- Dòng "(chưa xếp)" = giá trị factory không khớp ánh xạ → cần xếp tay sau khi migrate.
-- =====================================================================
SELECT COALESCE(e.factory, '(trống)') AS factory_hien_tai,
       CASE e.factory WHEN 'Nhà máy thổi' THEN 'Xưởng Thổi' WHEN 'Nhà máy cắt' THEN 'Xưởng Cắt'
                      WHEN 'Quản lý' THEN 'Văn phòng' ELSE '(chưa xếp)' END AS don_vi_moi,
       count(*) FILTER (WHERE NOT e.is_deleted) AS so_nv_dang_dung,
       count(*) FILTER (WHERE e.is_deleted)     AS so_nv_da_xoa
  FROM public.employees e
 GROUP BY 1, 2
 ORDER BY 1;

-- Phần 2: ca cũ sẽ được bật "qua đêm" (mục 26i) + giờ công sau migrate.
-- Ca chưa chỉnh giờ công (mặc định 8 giờ) → lấy theo độ dài ca. Kiểm cột gio_cong_moi có đúng thực tế không.
SELECT shift_code AS ma_ca, name AS ten_ca, start_time AS bat_dau, end_time AS ket_thuc,
       round(EXTRACT(EPOCH FROM (end_time - start_time + interval '24 hours')) / 3600, 2) AS gio_cong_moi
  FROM public.shifts
 WHERE is_deleted = FALSE AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time < start_time
 ORDER BY shift_code;
