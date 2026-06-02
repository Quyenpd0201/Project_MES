// backend/server.js
const express = require('express');
const cors = require('cors');
const productsRouter = require('./routes/products');
const mesRouter = require('./routes/mes');
const { ensureSeedAdmin } = require('./controllers/authController');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/products', productsRouter);
app.use('/api', mesRouter);
app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => { console.log(`MES API chạy tại http://localhost:${PORT}`); ensureSeedAdmin(); });
