const { prisma } = require('../src/config/db');

async function main() {
  try {
    const deleted = await prisma.propertyMedia.deleteMany({});
    console.log('✅ Cleaned broken old media rows:', deleted.count);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
