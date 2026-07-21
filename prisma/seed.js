/**
 * Ethred — Database Seed Script
 * Creates a default ADMIN user and sample data for development
 *
 * Run: npm run db:seed
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Ensure PostGIS extension and geom_point column exist
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS "postgis";`);
  await prisma.$executeRawUnsafe(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS geom_point GEOGRAPHY(Point, 4326);`);

  // ── Create Admin User ─────────────────────────────────────────────────────
  const adminEmail = 'admin@ethred.com';
  const existingAdmin = await prisma.user.findFirst({ where: { email: adminEmail } });

  if (!existingAdmin) {
    const password_hash = await bcrypt.hash('Admin@1234', 12);
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        phone_number: '+251911000000',
        password_hash,
        role: 'ADMIN',
        is_phone_verified: true,
        is_identity_verified: true,
        profile: {
          create: {
            full_name: 'Ethred Admin',
            preferred_language: 'en',
          },
        },
      },
    });
    console.log(`✅ Admin created: ${admin.email}`);
  } else {
    console.log('ℹ️  Admin already exists, skipping.');
  }

  // ── Create Sample Seller ──────────────────────────────────────────────────
  const sellerEmail = 'seller@ethred.com';
  const existingSeller = await prisma.user.findFirst({ where: { email: sellerEmail } });

  let seller;
  if (!existingSeller) {
    const password_hash = await bcrypt.hash('Seller@1234', 12);
    seller = await prisma.user.create({
      data: {
        email: sellerEmail,
        phone_number: '+251922000001',
        password_hash,
        role: 'SELLER',
        is_phone_verified: true,
        is_identity_verified: true,
        profile: {
          create: {
            full_name: 'Abebe Bekele',
            preferred_language: 'am',
          },
        },
      },
    });
    console.log(`✅ Seller created: ${seller.email}`);
  } else {
    seller = existingSeller;
    console.log('ℹ️  Seller already exists, skipping.');
  }

  // ── Create Sample Buyer ───────────────────────────────────────────────────
  const buyerEmail = 'buyer@ethred.com';
  const existingBuyer = await prisma.user.findFirst({ where: { email: buyerEmail } });

  if (!existingBuyer) {
    const password_hash = await bcrypt.hash('Buyer@1234', 12);
    await prisma.user.create({
      data: {
        email: buyerEmail,
        phone_number: '+251933000002',
        password_hash,
        role: 'BUYER',
        is_phone_verified: true,
        profile: {
          create: {
            full_name: 'Sara Tadesse',
            preferred_language: 'en',
          },
        },
      },
    });
    console.log(`✅ Buyer created: buyer@ethred.com`);
  } else {
    console.log('ℹ️  Buyer already exists, skipping.');
  }

  // ── Create Sample APPROVED Property ──────────────────────────────────────
  if (seller) {
    const existingProp = await prisma.property.findFirst({ where: { owner_id: seller.id } });
    if (!existingProp) {
      const property = await prisma.property.create({
        data: {
          owner_id: seller.id,
          title_en: 'Modern 3-Bedroom Apartment in Bole',
          title_am: 'ቦሌ ውስጥ ዘመናዊ 3 መኝታ አፓርትመንት',
          description_en: 'A stunning modern apartment located in the heart of Bole, Addis Ababa. Features include 3 spacious bedrooms, 2 bathrooms, fully equipped kitchen, and a panoramic city view. Close to Edna Mall and major transport links.',
          price_etb: 12500000.00,
          price_usd: 95000.00,
          transaction_mode: 'SALE',
          category: 'APARTMENT',
          region: 'Addis Ababa',
          city: 'Addis Ababa',
          sub_city: 'Bole',
          woreda: '03',
          kebele: '05',
          nearest_landmark: 'Edna Mall',
          bedrooms: 3,
          bathrooms: 2,
          area_sqm: 145.50,
          status: 'APPROVED',
          amenities: {
            create: [
              { amenity_name: 'Parking' },
              { amenity_name: 'Elevator' },
              { amenity_name: 'Security' },
              { amenity_name: 'Generator' },
            ],
          },
        },
      });

      // Set PostGIS geometry point (Bole, Addis Ababa coordinates)
      await prisma.$executeRaw`
        UPDATE properties 
        SET geom_point = ST_SetSRID(ST_MakePoint(38.7870, 9.0090), 4326)::geography
        WHERE id = ${property.id}::uuid
      `;

      console.log(`✅ Sample property created: ${property.title_en}`);
    } else {
      console.log('ℹ️  Sample property already exists, skipping.');
    }
  }

  console.log('\n✅ Database seeded successfully!');
  console.log('\n📋 Default credentials:');
  console.log('   Admin:  admin@ethred.com  /  Admin@1234');
  console.log('   Seller: seller@ethred.com /  Seller@1234');
  console.log('   Buyer:  buyer@ethred.com  /  Buyer@1234');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
