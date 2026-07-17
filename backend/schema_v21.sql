-- v21: Loại sản phẩm cho phép CHỌN NHIỀU giá trị (Thành phẩm / Bán thành phẩm / Nguyên vật liệu)
-- product_types (JSONB) = danh sách loại; product_type vẫn giữ giá trị CHÍNH (phần tử đầu) để
-- tương thích định tuyến kho (TP/BTP) và các so sánh cũ.

-- Bỏ ràng buộc cũ, dùng tên đầy đủ
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;
UPDATE products SET product_type = 'Nguyên vật liệu' WHERE product_type = 'NVL';

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_types JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE products SET product_types = jsonb_build_array(product_type)
  WHERE (product_types IS NULL OR product_types = '[]'::jsonb) AND product_type IS NOT NULL;
