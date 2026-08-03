const { prisma } = require('../src/config/db');
const bcrypt = require('bcryptjs');

async function main() {
  try {
    const password_hash = await bcrypt.hash('Admin@1234', 12);
    const seller_hash   = await bcrypt.hash('Seller@1234', 12);

    const admin = await prisma.user.upsert({
      where: { email: 'admin@ethred.com' },
      update: { password_hash: password_hash, role: 'ADMIN' },
      create: {
        email: 'admin@ethred.com',
        phone_number: '+251911000000',
        password_hash: password_hash,
        role: 'ADMIN',
        is_phone_verified: true,
        is_identity_verified: true,
      },
    });

    const seller = await prisma.user.upsert({
      where: { email: 'seller@ethred.com' },
      update: { password_hash: seller_hash, role: 'SELLER' },
      create: {
        email: 'seller@ethred.com',
        phone_number: '+251922000001',
        password_hash: seller_hash,
        role: 'SELLER',
        is_phone_verified: true,
        is_identity_verified: true,
      },
    });

    console.log('✅ Admin account ready :', admin.email);
    console.log('✅ Seller account ready:', seller.email);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
