import { qp, qdb, withTx } from './core';

// ── Master ICP ────────────────────────────────────────────────────────

export async function addMasterIcp(domain: string, companyName?: string) {
  await qp('INSERT INTO master_icp (domain, company_name) VALUES ($1, $2) ON CONFLICT (domain) DO NOTHING', [domain, companyName ?? null]);
}

export async function isInMasterIcp(domain: string): Promise<boolean> {
  const rows = await qp('SELECT 1 FROM master_icp WHERE domain = $1', [domain]);
  return rows.length > 0;
}

export async function getMasterIcpCount(): Promise<number> {
  const rows = await qp('SELECT COUNT(*) AS count FROM master_icp');
  return Number(rows[0].count);
}

export async function clearMasterIcp() {
  await qp('DELETE FROM master_icp');
}

export async function pushToMaster(companyIds: number[]) {
  await withTx(async (client) => {
    for (const id of companyIds) {
      await client.query(
        'INSERT INTO master_icp (domain, company_name) SELECT domain, company_name FROM companies WHERE id = $1 ON CONFLICT (domain) DO NOTHING',
        [id],
      );
      await client.query('UPDATE companies SET is_netnew = 0 WHERE id = $1', [id]);
    }
  });
}
