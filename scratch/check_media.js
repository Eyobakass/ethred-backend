const { prisma } = require('../src/config/db');

async function main() {
  try {
    const allMedia = await prisma.propertyMedia.findMany({
      select: { id: true, property_id: true, file_url: true }
    });
    console.log('ALL_MEDIA_ROWS:', JSON.stringify(allMedia, null, 2));
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
