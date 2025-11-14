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
  const { temperature, humidity, heat_index, mac_id, risk_color } = req.body;

  // ตรวจสอบว่าพารามิเตอร์หลักมีครบไหม
  if (temperature === undefined) return res.status(400).json({ error: 'Missing parameter: temperature' });
  if (humidity === undefined) return res.status(400).json({ error: 'Missing parameter: humidity' });

  const thailandTime = moment().tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss');

  // ✅ เพิ่มคอลัมน์ risk_color ด้วย
  const sql = `
    INSERT INTO sensor_data (temperature, humidity, heat_index, mac_id, recorded_at, risk_color)
    VALUES ($1, $2, $3, $4, $5, $6)
  `;

  try {
    await pool.query(sql, [temperature, humidity, heat_index, mac_id, thailandTime, risk_color]);
    console.log(`✅ New data added: ${temperature}°C, H=${humidity}%, Risk=${risk_color}`);
    res.json({ success: true, message: 'Data saved successfully' });
  } catch (err) {
    console.error('❌ Insert error:', err);
    res.status(500).json({ error: 'Database insert error' });
  }
});
app.get('/daily', async (req, res) => {
  try {
    let { date } = req.query;

    const targetDate = date || moment().tz('Asia/Bangkok').format('YYYY-MM-DD');

    const startOfDay = moment
      .tz(targetDate, 'Asia/Bangkok')
      .startOf('day')
      .format('YYYY-MM-DD HH:mm:ss');

    const endOfDay = moment
      .tz(targetDate, 'Asia/Bangkok')
      .endOf('day')
      .format('YYYY-MM-DD HH:mm:ss');

    const dataResult = await pool.query(
      `
      SELECT temperature, humidity, heat_index, mac_id, recorded_at
      FROM sensor_data
      WHERE (recorded_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok')
            BETWEEN $1 AND $2
      ORDER BY mac_id, recorded_at ASC
      `,
      [startOfDay, endOfDay]
    );

    return res.json({
      date: targetDate,
      total_devices: new Set(dataResult.rows.map(r => r.mac_id)).size,
      devices: dataResult.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});



// --- ดึงอุณหภูมิล่าสุด ---
app.get('/tmp', async (req, res) => {
  const sql = `
    SELECT temperature, humidity, heat_index, mac_id, recorded_at, risk_color
    FROM sensor_data
    ORDER BY recorded_at DESC
    LIMIT 1
  `;

  try {
    const { rows } = await pool.query(sql);
    if (rows.length === 0) return res.status(404).json({ message: 'No temperature data found' });

    const { temperature, humidity, heat_index, mac_id, recorded_at, risk_color } = rows[0];
    res.json({
      temperature,
      humidity,
      heat_index,
      mac_id,
      recorded_at,
      risk_color,
      status: getStatus(temperature)
    });
  } catch (err) {
    console.error('❌ Error querying database:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- ดึงประวัติอุณหภูมิ ---
app.get('/history', async (req, res) => {
  const sql = `
    SELECT temperature, humidity, heat_index, mac_id, recorded_at, risk_color
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
