import { pool, qp } from '../src/lib/db/core';
import { isExactRootMatch } from '../src/lib/domain-utils';

async function run() {
  const masterRes = await qp('SELECT domain FROM master_icp');
  const masterDomains = masterRes.map((r: any) => r.domain as string);
  
  // Fetch ALL companies so we can recalculate from scratch
  const allCompanies = await qp('SELECT id, domain, is_netnew FROM companies');
  
  let toNetNew0: number[] = [];
  let toNetNew1: number[] = [];
  
  for (const c of allCompanies) {
    let shouldBeNetNew0 = false;
    for (const mDomain of masterDomains) {
      if (isExactRootMatch(c.domain as string, mDomain)) {
        shouldBeNetNew0 = true;
        break;
      }
    }
    
    // If it was wrongly marked as 0 by my bad script, fix it back to 1
    if (shouldBeNetNew0 && c.is_netnew !== 0) {
      toNetNew0.push(c.id as number);
    } else if (!shouldBeNetNew0 && c.is_netnew === 0) {
      toNetNew1.push(c.id as number);
    }
  }
  
  if (toNetNew0.length > 0) {
    console.log(`Setting is_netnew = 0 for ${toNetNew0.length} companies...`);
    await qp('UPDATE companies SET is_netnew = 0 WHERE id = ANY($1::int[])', [toNetNew0]);
  }
  if (toNetNew1.length > 0) {
    console.log(`Setting is_netnew = 1 for ${toNetNew1.length} companies (reverting bad sync)...`);
    await qp('UPDATE companies SET is_netnew = 1 WHERE id = ANY($1::int[])', [toNetNew1]);
  }
  
  console.log('Done!');
  process.exit(0);
}

run().catch(console.error);
