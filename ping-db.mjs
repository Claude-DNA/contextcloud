import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
try {
  const r = await p.$queryRawUnsafe('SELECT 1 as alive');
  console.log('DB alive:', JSON.stringify(r));
} catch(e) {
  console.error('DB error:', e.message);
} finally {
  await p.$disconnect();
}
