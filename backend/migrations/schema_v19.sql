-- v19: tài liệu / hình ảnh đính kèm cho sản phẩm
CREATE TABLE IF NOT EXISTS product_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name         VARCHAR(255),
  content_type VARCHAR(120),
  is_image     BOOLEAN NOT NULL DEFAULT FALSE,
  data         TEXT,                 -- nội dung file dạng base64 data URL
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pa_product ON product_attachments (product_id, created_at DESC);
