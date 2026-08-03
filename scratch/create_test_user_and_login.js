/**
 * create_test_user_and_login.js
 * Creates a fresh test seller + property and logs in via the Render API
 * to get a valid JWT token that works with the real JWT_SECRET on Render.
 * 
 * Usage: node scratch/create_test_user_and_login.js
 */

const https = require('https');

const API_BASE = 'https://ethred-backend.onrender.com/api/v1';
const TEST_EMAIL = `test_tour_${Date.now()}@ethred.com`;
const TEST_PASSWORD = 'TestTour@2026!';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(API_BASE + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data && { 'Content-Length': Buffer.byteLength(data) }),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function authRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(API_BASE + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(data && { 'Content-Length': Buffer.byteLength(data) }),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  try {
    // 1. Register new seller
    console.log(`\n1. Registering new test user: ${TEST_EMAIL}`);
    const reg = await request('POST', '/auth/register', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      full_name: 'Tour Tester',
      phone_number: `+25191${Math.floor(1000000 + Math.random() * 9000000)}`,
      role: 'SELLER',
    });

    if (reg.status !== 201 && reg.status !== 200) {
      console.error('Registration failed:', reg.body);
      process.exit(1);
    }
    console.log('✓ Registered');

    // 2. Login
    console.log('2. Logging in...');
    const login = await request('POST', '/auth/login', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    if (login.status !== 200) {
      console.error('Login failed:', login.body);
      process.exit(1);
    }

    const token = login.body.data?.token || login.body.token;
    if (!token) {
      console.error('No token in login response:', login.body);
      process.exit(1);
    }
    console.log('✓ Logged in, got JWT');

    // 3. Create property
    console.log('3. Creating test property...');
    const prop = await authRequest('POST', '/properties', {
      title_en: 'Villa Sunrise Virtual Tour Test',
      title_am: 'ቪላ ሳንራይዝ የሙከራ ቤት',
      description_en: 'Beautiful 4-bedroom luxury villa built to test the 360 degree virtual tour feature on Ethred.',
      category: 'HOUSE',
      transaction_mode: 'SALE',
      price_etb: 15000000,
      bedrooms: 4,
      bathrooms: 3,
      area_sqm: 350,
      region: 'Addis Ababa',
      city: 'Addis Ababa',
      sub_city: 'Bole',
      woreda: '03',
    }, token);

    if (prop.status !== 201 && prop.status !== 200) {
      console.error('Property creation failed:', prop.body);
      process.exit(1);
    }

    const propertyId = prop.body.data?.id || prop.body.id;
    console.log('✓ Property created');

    console.log('\n================================================');
    console.log('🎉 READY FOR LIVE TESTING!');
    console.log('================================================');
    console.log('Property ID  :', propertyId);
    console.log('Email        :', TEST_EMAIL);
    console.log('Password     :', TEST_PASSWORD);
    console.log('Auth Token   :');
    console.log(token);
    console.log('================================================\n');
    console.log('Paste these into http://localhost:3000 → Agent Editor Mode\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

main();
