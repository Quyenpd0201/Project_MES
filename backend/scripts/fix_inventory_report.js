const fs = require('fs');

const path = 'src/modules/reports/InventoryReport.jsx';
let code = fs.readFileSync(path, 'utf8');

const replacement = `
  const groupedStock = React.useMemo(() => {
    const prods = new Map();
    for (const r of stockData) {
      if (!prods.has(r.product_id)) {
        prods.set(r.product_id, {
          product_id: r.product_id, product_code: r.product_code, product_name: r.product_name,
          product_type: r.product_type, min_quantity: r.min_quantity, warehouse_limits: r.warehouse_limits || [], 
          unit: r.unit, total: 0, warehouse_totals: {}
        });
      }
      const P = prods.get(r.product_id);
      P.total += Number(r.quantity) || 0;
      if (r.warehouse_id) {
        P.warehouse_totals[r.warehouse_id] = (P.warehouse_totals[r.warehouse_id] || 0) + (Number(r.quantity) || 0);
      }
      if (!P.unit && r.unit) P.unit = r.unit;
    }
    return [...prods.values()];
  }, [stockData]);

  // Filter stock by warehouse
  const filteredStock = groupedStock.filter(p => {
    const matchW = !warehouseFilter; // warehouse filter applied at lot level
    const matchP = !productFilter ||
      (p.product_name || "").toLowerCase().includes(productFilter.toLowerCase()) ||
      (p.product_code || "").toLowerCase().includes(productFilter.toLowerCase());
    return matchP;
  });
`;

code = code.replace(/(\/\/ Filter stock by warehouse\s*const filteredStock = stockData\.filter[\s\S]*?return matchP;\n  \}\);)/, replacement.trim());

fs.writeFileSync(path, code);
