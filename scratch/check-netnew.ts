import { qp } from '../src/lib/db/core';

async function run() {
  const masterRes = await qp('SELECT COUNT(*) as count FROM master_icp');
  console.log(`Master ICP count: ${masterRes[0].count}`);

  const netnewRes = await qp('SELECT COUNT(*) as count FROM companies WHERE is_netnew = 1');
  console.log(`Companies with is_netnew = 1: ${netnewRes[0].count}`);

  const notNetnewRes = await qp('SELECT COUNT(*) as count FROM companies WHERE is_netnew = 0');
  console.log(`Companies with is_netnew = 0: ${notNetnewRes[0].count}`);

  process.exit(0);
}

run().catch(console.error);
