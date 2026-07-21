-- v22: đồng bộ đơn vị tính về CHỮ HOA ở tất cả các bảng
UPDATE products              SET unit        = UPPER(unit)        WHERE unit        IS NOT NULL AND unit        <> UPPER(unit);
UPDATE sales_order_items     SET unit        = UPPER(unit)        WHERE unit        IS NOT NULL AND unit        <> UPPER(unit);
UPDATE production_orders     SET unit        = UPPER(unit)        WHERE unit        IS NOT NULL AND unit        <> UPPER(unit);
UPDATE inventory_stock       SET unit        = UPPER(unit)        WHERE unit        IS NOT NULL AND unit        <> UPPER(unit);
UPDATE bom_lines             SET unit        = UPPER(unit)        WHERE unit        IS NOT NULL AND unit        <> UPPER(unit);
UPDATE boms                  SET output_unit = UPPER(output_unit) WHERE output_unit IS NOT NULL AND output_unit <> UPPER(output_unit);
