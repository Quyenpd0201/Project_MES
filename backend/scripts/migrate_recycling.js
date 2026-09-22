const db = require('../src/core/db');

async function migrate() {
  try {
    console.log("Checking products...");
    const p1 = await db.query(`SELECT id FROM products WHERE product_name = 'Phế phẩm' LIMIT 1`);
    let scrapProdId;
    if (p1.rows.length === 0) {
       const res = await db.query(`INSERT INTO products (product_code, product_name, product_type, unit, created_at, updated_at) VALUES ('SP-PHE', 'Phế phẩm', 'Phế liệu', 'kg', NOW(), NOW()) RETURNING id`);
       scrapProdId = res.rows[0].id;
       console.log("Created Phế phẩm:", scrapProdId);
    } else {
       scrapProdId = p1.rows[0].id;
       console.log("Found Phế phẩm:", scrapProdId);
    }

    const p2 = await db.query(`SELECT id FROM products WHERE product_name = 'PE tái chế' LIMIT 1`);
    let peProdId;
    if (p2.rows.length === 0) {
       const res = await db.query(`INSERT INTO products (product_code, product_name, product_type, unit, created_at, updated_at) VALUES ('SP-PE-TC', 'PE tái chế', 'Bán thành phẩm', 'kg', NOW(), NOW()) RETURNING id`);
       peProdId = res.rows[0].id;
       console.log("Created PE tái chế:", peProdId);
    } else {
       peProdId = p2.rows[0].id;
       console.log("Found PE tái chế:", peProdId);
    }

    console.log("Creating tables...");
    await db.query(`
      CREATE TABLE IF NOT EXISTS recycling_tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_code VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'Chờ cân',
        export_date DATE,
        scrap_warehouse_id UUID,
        expected_qty DECIMAL(15,3) DEFAULT 0,
        third_party_name VARCHAR(255),
        internal_scrap_qty DECIMAL(15,3) DEFAULT 0,
        mixed_scrap_qty DECIMAL(15,3) DEFAULT 0,
        weighing_person VARCHAR(100),
        weighing_time TIMESTAMP,
        total_received_qty DECIMAL(15,3) DEFAULT 0,
        loss_qty DECIMAL(15,3) DEFAULT 0,
        import_warehouse_id UUID,
        product_id UUID,
        note TEXT,
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS recycling_rolls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id UUID REFERENCES recycling_tickets(id) ON DELETE CASCADE,
        roll_code VARCHAR(100) NOT NULL,
        pe_type VARCHAR(100),
        weight DECIMAL(15,3) DEFAULT 0,
        unit VARCHAR(20) DEFAULT 'kg',
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log("Done.");
  } catch(e) {
    console.error(e);
  }
}

migrate();
