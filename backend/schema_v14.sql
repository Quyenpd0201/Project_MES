-- v14: sinh mã LIỀN MẠCH (MAX hiện có + 1) thay cho sequence (tránh nhảy số)
-- Trigger dùng chung: nếu cột mã trống khi insert thì tự điền prefix + (max số hiện có + 1)

CREATE OR REPLACE FUNCTION gen_code_trg() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  prefix  text := TG_ARGV[0];
  width   int  := TG_ARGV[1]::int;
  colname text := TG_ARGV[2];
  cur     text;
  nextn   int;
  rec     jsonb;
BEGIN
  rec := to_jsonb(NEW);
  cur := rec->>colname;
  IF cur IS NULL OR cur = '' THEN
    EXECUTE format(
      'SELECT COALESCE(MAX(NULLIF(regexp_replace(%I, ''[^0-9]'', '''', ''g''), '''')::int), 0) + 1 FROM %I',
      colname, TG_TABLE_NAME
    ) INTO nextn;
    rec := jsonb_set(rec, ARRAY[colname], to_jsonb(prefix || lpad(nextn::text, width, '0')));
    NEW := jsonb_populate_record(NEW, rec);
  END IF;
  RETURN NEW;
END
$fn$;

-- Bỏ DEFAULT sequence + gắn trigger cho từng bảng
ALTER TABLE products          ALTER COLUMN product_code   DROP DEFAULT;
ALTER TABLE customers         ALTER COLUMN customer_code  DROP DEFAULT;
ALTER TABLE machines          ALTER COLUMN machine_code   DROP DEFAULT;
ALTER TABLE warehouses        ALTER COLUMN warehouse_code DROP DEFAULT;
ALTER TABLE locations         ALTER COLUMN location_code  DROP DEFAULT;
ALTER TABLE shifts            ALTER COLUMN shift_code     DROP DEFAULT;
ALTER TABLE employees         ALTER COLUMN employee_code  DROP DEFAULT;
ALTER TABLE roles             ALTER COLUMN role_code      DROP DEFAULT;
ALTER TABLE sales_orders      ALTER COLUMN order_code     DROP DEFAULT;
ALTER TABLE production_orders ALTER COLUMN order_code     DROP DEFAULT;
ALTER TABLE boms              ALTER COLUMN bom_code       DROP DEFAULT;
ALTER TABLE tech_processes    ALTER COLUMN process_code   DROP DEFAULT;

DROP TRIGGER IF EXISTS trg_gen_code ON products;
CREATE TRIGGER trg_gen_code BEFORE INSERT ON products          FOR EACH ROW EXECUTE FUNCTION gen_code_trg('SP', '5', 'product_code');
DROP TRIGGER IF EXISTS trg_gen_code ON customers;
CREATE TRIGGER trg_gen_code BEFORE INSERT ON customers         FOR EACH ROW EXECUTE FUNCTION gen_code_trg('KH', '5', 'customer_code');
DROP TRIGGER IF EXISTS trg_gen_code ON machines;
CREATE TRIGGER trg_gen_code BEFORE INSERT ON machines          FOR EACH ROW EXECUTE FUNCTION gen_code_trg('MC', '4', 'machine_code');
DROP TRIGGER IF EXISTS trg_gen_code ON warehouses;
CREATE TRIGGER trg_gen_code BEFORE INSERT ON warehouses        FOR EACH ROW EXECUTE FUNCTION gen_code_trg('K', '3', 'warehouse_code');
DROP TRIGGER IF EXISTS trg_gen_code ON locations;
CREATE TRIGGER trg_gen_code BEFORE INSERT ON locations         FOR EACH ROW EXECUTE FUNCTION gen_code_trg('VT', '4', 'location_code');
DROP TRIGGER IF EXISTS trg_gen_code ON shifts;
CREATE TRIGGER trg_gen_code BEFORE INSERT ON shifts            FOR EACH ROW EXECUTE FUNCTION gen_code_trg('CA', '2', 'shift_code');
DROP TRIGGER IF EXISTS trg_gen_code ON employees;
CREATE TRIGGER trg_gen_code BEFORE INSERT ON employees         FOR EACH ROW EXECUTE FUNCTION gen_code_trg('NV', '5', 'employee_code');
DROP TRIGGER IF EXISTS trg_gen_code ON roles;
CREATE TRIGGER trg_gen_code BEFORE INSERT ON roles             FOR EACH ROW EXECUTE FUNCTION gen_code_trg('VT', '3', 'role_code');
DROP TRIGGER IF EXISTS trg_gen_code ON sales_orders;
CREATE TRIGGER trg_gen_code BEFORE INSERT ON sales_orders      FOR EACH ROW EXECUTE FUNCTION gen_code_trg('DH', '5', 'order_code');
DROP TRIGGER IF EXISTS trg_gen_code ON production_orders;
CREATE TRIGGER trg_gen_code BEFORE INSERT ON production_orders FOR EACH ROW EXECUTE FUNCTION gen_code_trg('LSX', '5', 'order_code');
DROP TRIGGER IF EXISTS trg_gen_code ON boms;
CREATE TRIGGER trg_gen_code BEFORE INSERT ON boms              FOR EACH ROW EXECUTE FUNCTION gen_code_trg('BOM', '5', 'bom_code');
DROP TRIGGER IF EXISTS trg_gen_code ON tech_processes;
CREATE TRIGGER trg_gen_code BEFORE INSERT ON tech_processes    FOR EACH ROW EXECUTE FUNCTION gen_code_trg('QT', '4', 'process_code');
