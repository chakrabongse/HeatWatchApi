const express = require('express');
const app = express();
const cors = require('cors');
const mysql = require('mysql2'); // ใช้ mysql2 ดีกว่าเพราะรองรับ Promise
const port = 3000;

app.use(cors());
app.use(express.json());       // สำหรับอ่าน JSON body
app.use(express.urlencoded({ extended: true })); // สำหรับอ่าน form data
// --- ตั้งค่าการเชื่อมต่อฐานข้อมูล ---
const db = mysql.createConnection({
  host: 'sql12.freesqldatabase.com',
  user: 'sql12805960',          // เปลี่ยนตาม user ของคุณ
  password: 'bMtFEAXFRN',           // ใส่รหัสผ่าน MySQL ของคุณ
  database: 'sql12805960' // ชื่อฐานข้อมูลที่สร้างไว้
});

// --- เชื่อมต่อฐานข้อมูล ---
db.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    return;
  }
  console.log('✅ Connected to MySQL database');
});

// --- route หลัก ---
app.get('/', (req, res) => {
  res.send('🌡️ Temperature Service is running with Database!');
});

const moment = require('moment-timezone'); // แนะนำวางบนสุดของไฟล์
app.post('/add', (req, res) => {
  const { temperature, humidity, mac_id } = req.body;

  // ตรวจสอบว่ามีค่า temperature และ humidity
  if (temperature === undefined) {
    return res.status(400).json({ error: 'Missing parameter: temperature' });
  }
  if (humidity === undefined) {
    return res.status(400).json({ error: 'Missing parameter: humidity' });
  }

  // เวลาประเทศไทยปัจจุบัน
  const thailandTime = moment().tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss');
  console.log('Bangkok Time:', thailandTime);

  const sql = `INSERT INTO temperature_log (temperature, humidity, heat_index, mac_id, recorded_at) VALUES (?, ?, ?, ?, ?)`;

  db.query(sql, [temperature, humidity, heat_index, mac_id, thailandTime], (err, result) => {
    if (err) {
      console.error('❌ Insert error:', err);
      return res.status(500).json({ error: 'Database insert error' });
    }

    console.log(`✅ New temperature added: ${temperature}°C, Humidity: ${humidity}% (Recorded in Bangkok Time)`);
    res.json({ success: true, message: 'Data saved successfully' });
  });
});


// --- route สำหรับดึงอุณหภูมิล่าสุดจากฐานข้อมูล ---
app.get('/tmp', (req, res) => {
  const sql = 'SELECT temperature, humidity, heat_index, mac_id, recorded_at FROM temperature_log ORDER BY recorded_at DESC LIMIT 1';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('❌ Error querying database:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'No temperature data found' });
    }

    const { temperature,humidity, heat_index, mac_id, recorded_at } = results[0];
    res.json({
      temperature,
      humidity,
      heat_index,
      mac_id,
      recorded_at,
      status: getStatus(temperature)
    });
  });
});

// --- ดึงประวัติอุณหภูมิ 20 รายการล่าสุด ---
app.get('/history', (req, res) => {
  const sql = 'SELECT temperature,humidity, heat_index, mac_id, recorded_at FROM temperature_log ORDER BY recorded_at DESC LIMIT 5';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('❌ Error querying database:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});

// --- ฟังก์ชันแสดงสถานะตามอุณหภูมิ ---
function getStatus(temp) {
  if (temp < 25) return 'Cool ❄️';
  if (temp < 45) return 'Normal 🌤️';
  if (temp < 70) return 'Warm ☀️';
  return 'Hot 🔥';
}

// --- เริ่มรันเซิร์ฟเวอร์ ---
app.listen(port, () => {
  console.log(`✅ Temperature API running on http://localhost:${port}`);
});
