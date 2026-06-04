import { qp, withTx } from './core';
import type { FieldChange } from './companies';

// ── Upload batches & field-change audit ──────────────────────────────────────
//
// Each CSV upload is one batch. Every field a batch writes is logged with its
// before/after value, so the upload can be rolled back to the exact prior state.

export interface BatchMeta {
  funnel_id: number;
  source_type: string;
  source_file: string | null;
  mapping: Record<string, string> | null;
  is_manual_mapping: boolean;
}

export async function createUploadBatch(meta: BatchMeta): Promise<number> {
  const rows = await qp(
    `INSERT INTO upload_batches (funnel_id, source_type, source_file, mapping, is_manual_mapping, status)
     VALUES ($1, $2, $3, $4::jsonb, $5, 'applied') RETURNING id`,
    [
      meta.funnel_id,
      meta.source_type,
      meta.source_file,
      meta.mapping ? JSON.stringify(meta.mapping) : null,
      meta.is_manual_mapping ? 1 : 0,
    ],
  );
  return rows[0].id as number;
}

export interface BatchChangeRow extends FieldChange {
  company_id: number;
  was_insert: boolean;
}

/** Bulk-insert the audit rows for one chunk of an import. */
export async function recordFieldChanges(batchId: number, changes: BatchChangeRow[]) {
  if (changes.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  changes.forEach((c, i) => {
    const b = i * 6;
    tuples.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`);
    values.push(batchId, c.company_id, c.field, c.old_value, c.new_value, c.was_insert ? 1 : 0);
  });

  await qp(
    `INSERT INTO company_field_changes (batch_id, company_id, field, old_value, new_value, was_insert)
     VALUES ${tuples.join(', ')}`,
    values,
  );
}

export async function finalizeUploadBatch(
  batchId: number,
  summary: {
    total_rows: number;
    new_companies: number;
    matched_companies: number;
    fields_updated: Record<string, number>;
    skipped_fields: Record<string, number>;
  },
) {
  await qp(
    `UPDATE upload_batches
       SET total_rows = $2, new_companies = $3, matched_companies = $4,
           fields_updated = $5::jsonb, skipped_fields = $6::jsonb
     WHERE id = $1`,
    [
      batchId,
      summary.total_rows,
      summary.new_companies,
      summary.matched_companies,
      JSON.stringify(summary.fields_updated),
      JSON.stringify(summary.skipped_fields),
    ],
  );
}

/** Delete a batch shell (used if an import fails before recording anything). */
export async function deleteUploadBatch(batchId: number) {
  await qp('DELETE FROM upload_batches WHERE id = $1', [batchId]);
}

export async function listUploadBatches(funnelId: number) {
  return qp(
    `SELECT id, funnel_id, source_type, source_file, status, total_rows,
            new_companies, matched_companies, fields_updated, skipped_fields,
            is_manual_mapping, created_at, rolled_back_at
       FROM upload_batches
      WHERE funnel_id = $1
      ORDER BY created_at DESC`,
    [funnelId],
  );
}

export interface RollbackSummary {
  deleted_companies: number;
  reverted_companies: number;
  reverted_fields: number;
  kept_fields: number;   // fields a later upload changed — left untouched
}

/**
 * Roll a batch back to its prior state.
 *
 *  - Companies the batch CREATED are deleted (cascades funnel link, aliases,
 *    audit). Guard: a created company that has since been classified is kept and
 *    field-reverted instead, so curated work is never silently destroyed.
 *  - For pre-existing companies, each field is reverted to its old value ONLY if
 *    its current value still equals what this batch wrote (i.e. no later upload
 *    has since changed it). Fields a later upload changed are left as-is.
 */
export async function rollbackBatch(batchId: number): Promise<RollbackSummary> {
  return withTx(async (client) => {
    const batchRes = await client.query('SELECT * FROM upload_batches WHERE id = $1', [batchId]);
    const batch = batchRes.rows[0];
    if (!batch) throw new Error('Upload batch not found');
    if (batch.status !== 'applied') throw new Error('This upload has already been rolled back');

    const changeRes = await client.query(
      'SELECT company_id, field, old_value, new_value, was_insert FROM company_field_changes WHERE batch_id = $1',
      [batchId],
    );
    const changes = changeRes.rows as Array<{
      company_id: number; field: string; old_value: string | null;
      new_value: string | null; was_insert: number;
    }>;

    const createdIds = [...new Set(changes.filter(c => c.was_insert === 1).map(c => c.company_id))];

    // Of the created companies, only delete those not yet classified.
    let deletableIds: number[] = [];
    if (createdIds.length > 0) {
      const guardRes = await client.query(
        'SELECT id FROM companies WHERE id = ANY($1::int[]) AND classified_at IS NULL',
        [createdIds],
      );
      deletableIds = guardRes.rows.map(r => r.id as number);
    }
    const deletableSet = new Set(deletableIds);

    let deleted_companies = 0;
    if (deletableIds.length > 0) {
      await client.query('DELETE FROM companies WHERE id = ANY($1::int[])', [deletableIds]);
      deleted_companies = deletableIds.length;
    }

    // Revert field changes for every company that wasn't deleted.
    const byCompany = new Map<number, typeof changes>();
    for (const c of changes) {
      if (deletableSet.has(c.company_id)) continue;
      const arr = byCompany.get(c.company_id) ?? [];
      arr.push(c);
      byCompany.set(c.company_id, arr);
    }

    let reverted_companies = 0;
    let reverted_fields = 0;
    let kept_fields = 0;

    for (const [companyId, companyChanges] of byCompany) {
      const curRes = await client.query('SELECT * FROM companies WHERE id = $1', [companyId]);
      const cur = curRes.rows[0];
      if (!cur) continue;

      const sets: string[] = [];
      const values: unknown[] = [];
      for (const ch of companyChanges) {
        const currentText = cur[ch.field] === null || cur[ch.field] === undefined ? null : String(cur[ch.field]);
        if (currentText === ch.new_value) {
          values.push(ch.old_value);
          sets.push(`${ch.field} = $${values.length}`);
          reverted_fields++;
        } else {
          kept_fields++;   // a later upload owns this value now — leave it
        }
      }
      if (sets.length > 0) {
        values.push(companyId);
        await client.query(`UPDATE companies SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
        reverted_companies++;
      }
    }

    await client.query(
      "UPDATE upload_batches SET status = 'rolled_back', rolled_back_at = NOW() WHERE id = $1",
      [batchId],
    );

    return { deleted_companies, reverted_companies, reverted_fields, kept_fields };
  });
}

/** funnel_id for a batch (so the API can recompute that funnel after rollback). */
export async function getBatchFunnelId(batchId: number): Promise<number | null> {
  const rows = await qp('SELECT funnel_id FROM upload_batches WHERE id = $1', [batchId]);
  return rows[0] ? (rows[0].funnel_id as number) : null;
}

// ── Match Decision Log ───────────────────────────────────────────────────────
//
// Every row processed during a CSV import records HOW it was matched (or that
// it was a new insert). This gives full visibility into the 5% of non-trivial
// matches without changing any matching behaviour.

export async function ensureMatchDecisionsTable() {
  await qp(`
    CREATE TABLE IF NOT EXISTS match_decisions (
      id              SERIAL PRIMARY KEY,
      batch_id        INTEGER REFERENCES upload_batches(id) ON DELETE CASCADE,
      input_domain    TEXT NOT NULL,
      matched_domain  TEXT,
      company_id      INTEGER,
      match_method    TEXT NOT NULL,
      match_detail    TEXT,
      confidence      TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await qp(`CREATE INDEX IF NOT EXISTS idx_md_batch ON match_decisions(batch_id)`);
  await qp(`CREATE INDEX IF NOT EXISTS idx_md_method ON match_decisions(match_method)`);
}

export interface MatchDecisionRow {
  batch_id: number;
  input_domain: string;
  matched_domain: string | null;
  company_id: number;
  match_method: string;
  match_detail: string | null;
  confidence: string;
}

/** Bulk-insert match decisions for one chunk of an import. */
export async function recordMatchDecisions(decisions: MatchDecisionRow[]) {
  if (decisions.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  decisions.forEach((d, i) => {
    const b = i * 7;
    tuples.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`);
    values.push(d.batch_id, d.input_domain, d.matched_domain, d.company_id, d.match_method, d.match_detail, d.confidence);
  });

  await qp(
    `INSERT INTO match_decisions (batch_id, input_domain, matched_domain, company_id, match_method, match_detail, confidence)
     VALUES ${tuples.join(', ')}`,
    values,
  );
}

export interface MatchDecisionView {
  id: number;
  input_domain: string;
  matched_domain: string | null;
  company_id: number;
  match_method: string;
  match_detail: string | null;
  confidence: string;
  created_at: string;
  company_name: string | null;
}

/** Get all match decisions for a batch, joined with company name. */
export async function getMatchDecisions(
  batchId: number,
  filters?: { method?: string; search?: string },
): Promise<MatchDecisionView[]> {
  let where = 'WHERE md.batch_id = $1';
  const params: unknown[] = [batchId];
  let paramIdx = 2;

  if (filters?.method && filters.method !== 'all') {
    where += ` AND md.match_method = $${paramIdx}`;
    params.push(filters.method);
    paramIdx++;
  }

  if (filters?.search) {
    where += ` AND (md.input_domain ILIKE $${paramIdx} OR md.matched_domain ILIKE $${paramIdx} OR c.company_name ILIKE $${paramIdx})`;
    params.push(`%${filters.search}%`);
    paramIdx++;
  }

  return qp<MatchDecisionView>(
    `SELECT md.*, c.company_name
     FROM match_decisions md
     LEFT JOIN companies c ON c.id = md.company_id
     ${where}
     ORDER BY md.id`,
    params,
  );
}

/** Summary counts per match method for a batch. */
export async function getMatchDecisionSummary(batchId: number): Promise<Array<{ method: string; count: number }>> {
  return qp(
    `SELECT match_method AS method, COUNT(*) AS count
     FROM match_decisions WHERE batch_id = $1
     GROUP BY match_method ORDER BY count DESC`,
    [batchId],
  );
}
