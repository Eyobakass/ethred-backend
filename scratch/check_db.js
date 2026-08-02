const { prisma } = require('../src/config/db');

async function main() {
  try {
    const property = await prisma.property.findFirst({
      select: { id: true, title_en: true }
    });
    console.log('EXISTING_PROPERTY:', JSON.stringify(property));
  } catch (err) {
    console.error('DB_ERROR:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
