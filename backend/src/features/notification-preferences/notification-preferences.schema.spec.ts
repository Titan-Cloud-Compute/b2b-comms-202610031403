/**
 * Story: notification-preferences — schema + 0011_notification_preferences migration checks.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';

const PRISMA_DIR = join(__dirname, '..', '..', '..', 'prisma');
const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
const MIGRATION = join(PRISMA_DIR, 'migrations', '0011_notification_preferences', 'migration.sql');
const sql = existsSync(MIGRATION) ? readFileSync(MIGRATION, 'utf8') : '';

describe('notification-preferences schema', () => {
  it('declares the effective-dated NotificationPreferenceChange model', () => {
    expect(schema).toMatch(/\bmodel NotificationPreferenceChange \{/);
    expect(schema).toMatch(/orderAlerts\s+Boolean\s+@default\(true\)/);
    expect(schema).toMatch(/messageAlerts\s+Boolean\s+@default\(true\)/);
    expect(schema).toMatch(/effectiveAt\s+DateTime\s+@default\(now\(\)\)/);
  });

  it('generated client exposes the model', () => {
    expect(Object.values(Prisma.ModelName)).toContain('NotificationPreferenceChange');
  });

  it('migration creates the table with defaults on both toggles', () => {
    expect(sql).not.toBe('');
    expect(sql).toMatch(/CREATE TABLE (IF NOT EXISTS )?"NotificationPreferenceChange"/);
    expect(sql).toContain('"orderAlerts" BOOLEAN NOT NULL DEFAULT true');
    expect(sql).toContain('"messageAlerts" BOOLEAN NOT NULL DEFAULT true');
    expect(sql).toContain('"effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP');
  });

  it('migration does not alter auth or other stories’ tables', () => {
    expect(sql).not.toMatch(/ALTER TABLE/);
    expect(sql).not.toMatch(/DROP TABLE/);
  });
});
