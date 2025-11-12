const express = require('express');
const app = express();
const cors = require('cors');
const moment = require('moment-timezone');
const { Pool } = require('pg');
const dns = require('dns');

// ✅ บังคับ Node.js ให้ใช้ IPv4 ก่อน (แก้ปัญหา ENETUNREACH บน Render)
dns.setDefaultResultOrder('ipv4first');

const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- ตั้งค่าการเชื่อมต่อ PostgreSQL (Supabase) ---
const pool = new Pool({
  host: 'aws-1-ap-southeast-1.pooler.supabase.com',
  user: 'postgres.hdtsvwcrhxzauwwzkawr',
  password: 'Chakrabongse1', // อย่าใส่ในโค้ดจริงถ้า deploy ให้ใช้ ENV variable แทน
  database: 'postgres',
  port: 5432,
  ssl: { rejectUnauthorized: false },
});

// --- ตรวจสอบการเชื่อมต่อ ---
pool.connect()
  .then(() => console.log('✅ Connected to PostgreSQL database'))
  .catch(err => console.error('❌ Database connection failed:', err));

// --- route หลัก ---
app.get('/', (req, res) => {
  res.send('🌡️ Temperature Service is running with PostgreSQL!');
});

// --- เพิ่มข้อมูลใหม่ ---
app.post('/add', async (req, res) => {
  const { temperature, humidity, heat_index, mac_id } = req.body;

  if (temperature === undefined) return res.status(400).json({ error: 'Missing parameter: temperature' });
  if (humidity === undefined) return res.status(400).json({ error: 'Missing parameter: humidity' });

  const thailandTime = moment().tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss');
  const sql = `
    INSERT INTO sensor_data (temperature, humidity, heat_index, mac_id, recorded_at)
    VALUES ($1, $2, $3, $4, $5)
  `;

  try {
    await pool.query(sql, [temperature, humidity, heat_index, mac_id, thailandTime]);
    console.log(`✅ New temperature added: ${temperature}°C, Humidity: ${humidity}%`);
    res.json({ success: true, message: 'Data saved successfully' });
  } catch (err) {
    console.error('❌ Insert error:', err);
    res.status(500).json({ error: 'Database insert error' });
  }
});
// --- ดึงข้อมูลทั้งวันของวันล่าสุด (แยกตาม device) ---
app.get('/daily', async (req, res) => {
  try {
    const { date } = req.query; // ถ้ามี query date=YYYY-MM-DD จะใช้วันนั้นแทน
    let targetDate = date;

    // ถ้าไม่ส่งวันที่มา → ใช้วันล่าสุดที่มีข้อมูลใน DB
    if (!targetDate) {
      const latestDayResult = await pool.query(`
        SELECT DATE(recorded_at AT TIME ZONE 'Asia/Bangkok') AS latest_date
        FROM sensor_data
        ORDER BY recorded_at DESC
        LIMIT 1
      `);

      if (latestDayResult.rows.length === 0) {
        return res.status(404).json({ message: 'No temperature data found' });
      }

      targetDate = latestDayResult.rows[0].latest_date;
    }

    // ✅ ดึงข้อมูลทั้งหมดของวันนั้น
    const dataResult = await pool.query(`
      SELECT temperature, humidity, heat_index, mac_id, recorded_at
      FROM sensor_data
      WHERE DATE(recorded_at AT TIME ZONE 'Asia/Bangkok') = $1
      ORDER BY mac_id, recorded_at ASC
    `, [targetDate]);

    if (dataResult.rows.length === 0) {
      return res.status(404).json({ message: `No data found for ${targetDate}` });
    }

    // ✅ จัดกลุ่มข้อมูลตาม mac_id (device)
    const grouped = {};
    dataResult.rows.forEach(record => {
      const device = record.mac_id || 'unknown_device';
      if (!grouped[device]) grouped[device] = [];
      grouped[device].push(record);
    });

    // ✅ เติมชั่วโมงที่ไม่มีข้อมูลด้วย null
    const moment = require('moment-timezone');
    const fullDayHours = Array.from({ length: 24 }, (_, i) => i); // 0 - 23

    Object.keys(grouped).forEach(mac_id => {
      const existingHours = grouped[mac_id].map(r =>
        moment(r.recorded_at).tz('Asia/Bangkok').hour()
      );

      fullDayHours.forEach(h => {
        if (!existingHours.includes(h)) {
          grouped[mac_id].push({
            mac_id,
            temperature: null,
            humidity: null,
            heat_index: null,
            recorded_at: moment.tz(targetDate, 'Asia/Bangkok').hour(h).minute(0).second(0).toISOString()
          });
        }
      });

      // เรียงข้อมูลตามเวลา
      grouped[mac_id].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
    });

    // ✅ ส่งข้อมูลกลับ
    res.json({
      date: targetDate,
      total_devices: Object.keys(grouped).length,
      devices: grouped
    });

  } catch (err) {
    console.error('❌ Error querying daily data:', err);
    res.status(500).json({ error: 'Database error' });
  }
});




// --- ดึงอุณหภูมิล่าสุด ---
app.get('/tmp', async (req, res) => {
  const sql = `
    SELECT temperature, humidity, heat_index, mac_id, recorded_at 
    FROM sensor_data 
    ORDER BY recorded_at DESC 
    LIMIT 1
  `;

  try {
    const { rows } = await pool.query(sql);
    if (rows.length === 0) return res.status(404).json({ message: 'No temperature data found' });

    const { temperature, humidity, heat_index, mac_id, recorded_at } = rows[0];
    res.json({ temperature, humidity, heat_index, mac_id, recorded_at, status: getStatus(temperature) });
  } catch (err) {
    console.error('❌ Error querying database:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- ดึงประวัติอุณหภูมิ ---
app.get('/history', async (req, res) => {
  const sql = `
    SELECT temperature, humidity, heat_index, mac_id, recorded_at 
    FROM sensor_data 
    ORDER BY recorded_at DESC
  `;

  try {
    const { rows } = await pool.query(sql);
    const grouped = {};
    rows.forEach(record => {
      if (!grouped[record.mac_id]) grouped[record.mac_id] = [];
      if (grouped[record.mac_id].length < 5) grouped[record.mac_id].push(record);
    });
    res.json(Object.values(grouped).flat());
  } catch (err) {
    console.error('❌ Error querying database:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- ฟังก์ชันแสดงสถานะตามอุณหภูมิ ---
function getStatus(temp) {
  if (temp < 25) return 'Cool ❄️';
  if (temp < 45) return 'Normal 🌤️';
  if (temp < 70) return 'Warm ☀️';
  return 'Hot 🔥';
}

// --- เริ่มเซิร์ฟเวอร์ ---
app.listen(port, () => {
  console.log(`✅ Temperature API running on http://localhost:${port}`);
});
