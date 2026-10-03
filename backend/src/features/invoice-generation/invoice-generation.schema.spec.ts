/**
 * Story: invoice-generation — schema + 0009_invoice_generation migration checks.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';

const PRISMA_DIR = join(__dirname, '..', '..', '..', 'prisma');
const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
const MIGRATION = join(PRISMA_DIR, 'migrations', '0009_invoice_generation', 'migration.sql');
const sql = existsSync(MIGRATION) ? readFileSync(MIGRATION, 'utf8') : '';

describe('invoice-generation schema', () => {
  it('declares model Invoice with the required fields', () => {
    const m = /model Invoice \{([\s\S]*?)\n\}/.exec(schema);
    expect(m).not.toBeNull();
    const body = m![1];
    expect(body).toMatch(/\bid\s+String\s+@id/);
    expect(body).toMatch(/\borderId\s+String\s+@unique/);
    expect(body).toMatch(/\bvendorUserId\s+String/);
    expect(body).toMatch(/\bcustomerUserId\s+String/);
    expect(body).toMatch(/\bnumber\s+String\s+@unique/);
    expect(body).toMatch(/\btotalCents\s+Int/);
    expect(body).toMatch(/\bcreatedAt\s+DateTime\s+@default\(now\(\)\)/);
  });

  it('generated client exposes Invoice', () => {
    expect(Object.values(Prisma.ModelName)).toContain('Invoice');
  });

  it('0009_invoice_generation migration creates the Invoice table and unique keys', () => {
    expect(sql).not.toBe('');
    expect(sql).toMatch(/CREATE TABLE (IF NOT EXISTS )?"Invoice"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX (IF NOT EXISTS )?"Invoice_orderId_key"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX (IF NOT EXISTS )?"Invoice_number_key"/);
  });

  it('migration does not alter order-management, auth or shared-channel tables', () => {
    expect(sql).not.toMatch(/ALTER TABLE/);
    expect(sql).not.toMatch(/DROP TABLE/);
  });
});
