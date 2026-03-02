const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();
p.$queryRawUnsafe('SELECT 1 as alive')
  .then(r => { console.log('DB alive:', JSON.stringify(r)); return p.$disconnect(); })
  .catch(e => { console.error('DB error:', e.message); return p.$disconnect(); });
