import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Key in .env file");
  process.exit(1);
}

console.log("Supabase URL:", supabaseUrl);
// Only log the first few chars of the key for safety
console.log("Supabase Key (partial):", supabaseKey.substring(0, 15) + "...");

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    console.log("Attempting to connect to Supabase...");
    
    // Test auth service as a ping
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error("❌ Lỗi khi kết nối (Auth Error):", error.message || error);
    } else {
      console.log("✅ Kết nối đến Supabase thành công!");
      console.log("Thông tin session (nếu có):", data.session ? "Có session" : "Không có session (bình thường nếu chưa đăng nhập)");
    }
  } catch (err) {
    console.error("❌ Lỗi mạng / Lỗi không xác định khi kết nối Supabase:", err.message);
  }
}

testConnection();
