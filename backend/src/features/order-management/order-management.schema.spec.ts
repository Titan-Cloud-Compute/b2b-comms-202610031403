/**
 * Story: order-management — schema + 0008_order_management migration checks.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';

const PRISMA_DIR = join(__dirname, '..', '..', '..', 'prisma');
const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
const MIGRATION = join(PRISMA_DIR, 'migrations', '0008_order_management', 'migration.sql');
const sql = existsSync(MIGRATION) ? readFileSync(MIGRATION, 'utf8') : '';
const MODELS = ['Product', 'Order', 'OrderItem', 'OrderNotification'];

describe('order-management schema', () => {
  it.each(MODELS)('declares model %s in schema.prisma', (model) => {
    expect(schema).toMatch(new RegExp(`\\bmodel ${model} \\{`));
  });

  it('declares the PENDING/CONFIRMED order status enum', () => {
    expect(schema).toMatch(/enum OrderStatus \{\s*PENDING\s*CONFIRMED\s*\}/);
    expect(schema).toMatch(/status\s+OrderStatus\s+@default\(PENDING\)/);
    expect(schema).toMatch(/estimatedDeliveryDate\s+DateTime\?/);
  });

  it('generated client exposes the new models', () => {
    const names = Object.values(Prisma.ModelName) as string[];
    expect(names).toEqual(expect.arrayContaining(MODELS));
  });

  it('0008_order_management migration creates all tables and the status enum', () => {
    expect(sql).not.toBe('');
    for (const t of MODELS) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE (IF NOT EXISTS )?"${t}"`));
    }
    expect(sql).toContain(`CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED')`);
    expect(sql).toContain(`"status" "OrderStatus" NOT NULL DEFAULT 'PENDING'`);
    expect(sql).toContain('"estimatedDeliveryDate" TIMESTAMP(3)');
  });

  it('migration does not alter auth or shared-channel tables', () => {
    expect(sql).not.toMatch(/ALTER TABLE "(User|Customer|Message|SharedChannel|ChannelMember)"/);
    expect(sql).not.toMatch(/DROP TABLE/);
  });
});
