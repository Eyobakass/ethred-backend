/**
 * create_test_property.js
 * Run this script to create a test Seller user and a test Property in your database.
 * Output: Property UUID + Test JWT token for uploading scenes via API.
 * 
 * Usage: node scratch/create_test_property.js
 */

const { prisma } = require('../src/config/db');
const jwt = require('jsonwebtoken');

async function createTestProperty() {
  try {
    console.log('Connecting to database...');

    // 1. Find or create a test Seller user
    let user = await prisma.user.findFirst({
      where: { role: 'SELLER' },
    });

    if (!user) {
      console.log('No seller user found. Creating test seller user...');
      user = await prisma.user.create({
        data: {
          email: `test_seller_${Date.now()}@ethred.com`,
          password_hash: '$2b$10$e7xV6G8J9012345678901e', // dummy hash
          first_name: 'Test',
          last_name: 'Seller',
          phone_number: `+251911${Math.floor(100000 + Math.random() * 900000)}`,
          role: 'SELLER',
          is_verified: true,
        },
      });
    }

    console.log('✓ User ready:', user.email, `(ID: ${user.id})`);

    // 2. Create a test Property
    const property = await prisma.property.create({
      data: {
        owner_id: user.id,
        title_en: 'Villa Sunrise Test Property',
        title_am: 'ቪላ ሳንራይዝ የሙከራ ቤት',
        description_en: 'Beautiful 4 bedroom luxury villa with 360 degree virtual tour support.',
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
        status: 'APPROVED',
      },
    });

    console.log('\n==================================================');
    console.log('🎉 TEST PROPERTY CREATED SUCCESSFULLY!');
    console.log('==================================================');
    console.log('Property ID (UUID) :', property.id);
    console.log('Owner Email        :', user.email);

    // Generate JWT token
    const secret = process.env.JWT_SECRET || 'dev_secret_key_change_in_production';
    const token = jwt.sign(
      { userId: user.id, id: user.id, role: user.role, email: user.email },
      secret,
      { expiresIn: '7d' }
    );

    console.log('\nAuth Token (for TourEditor uploads):');
    console.log(token);
    console.log('==================================================\n');

  } catch (err) {
    console.error('❌ Failed to create test property:', err);
  } finally {
    await prisma.$disconnect();
  }
}

createTestProperty();
