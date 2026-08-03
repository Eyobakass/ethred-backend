/**
 * generate_valid_token.js
 * Generates a JWT that matches exactly what passport-jwt expects:
 *   - payload.sub = user UUID
 *   - signed with the same secret as the backend (fallback or env)
 */

const { prisma } = require('../src/config/db');
const jwt = require('jsonwebtoken');

async function main() {
  try {
    const user = await prisma.user.findFirst({
      where: { role: 'SELLER' },
      select: { id: true, email: true, role: true, phone_number: true },
    });

    if (!user) {
      console.error('No SELLER user found in DB.');
      process.exit(1);
    }

    console.log('Found user:', user.email, '(ID:', user.id + ')');

    const secret = process.env.JWT_SECRET || 'ethred_jwt_fallback_secret_key_2026';

    // Match exactly what passport-jwt expects: payload.sub = user id
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn: '7d' }
    );

    console.log('\n==================================================');
    console.log('✅ VALID JWT TOKEN (works with Render backend)');
    console.log('==================================================');
    console.log('User ID    :', user.id);
    console.log('Email      :', user.email);
    console.log('Role       :', user.role);
    console.log('\nAuth Token :');
    console.log(token);
    console.log('==================================================\n');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
