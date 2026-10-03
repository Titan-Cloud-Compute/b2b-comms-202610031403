/**
 * Story: shared-channel — schema + migration 0006 presence checks.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';

const PRISMA_DIR = join(__dirname, '..', '..', '..', 'prisma');
const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');

function migrationSql(): string {
  const dir = readdirSync(join(PRISMA_DIR, 'migrations')).find((d) => d.startsWith('0006_'));
  if (!dir) return '';
  const file = join(PRISMA_DIR, 'migrations', dir, 'migration.sql');
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

describe('shared-channel schema', () => {
  it.each(['Customer', 'SharedChannel', 'ChannelMember', 'Message'])(
    'declares model %s in schema.prisma',
    (model) => {
      expect(schema).toMatch(new RegExp(`\\bmodel ${model} \\{`));
    },
  );

  it('generated client exposes the new models', () => {
    const names = Object.values(Prisma.ModelName) as string[];
    expect(names).toEqual(
      expect.arrayContaining(['Customer', 'SharedChannel', 'ChannelMember', 'Message']),
    );
  });

  it('migration 0006 creates all four tables and the member role enum', () => {
    const sql = migrationSql();
    expect(sql).not.toBe('');
    for (const t of ['Customer', 'SharedChannel', 'ChannelMember', 'Message']) {
      expect(sql).toContain(`CREATE TABLE "${t}"`);
    }
    expect(sql).toContain('CREATE TYPE "ChannelMemberRole"');
    expect(sql).toContain('"ChannelMember_channelId_userId_key"');
  });

  it('migration 0006 does not alter auth tables', () => {
    const sql = migrationSql();
    expect(sql).not.toMatch(/ALTER TABLE "User"/);
    expect(sql).not.toMatch(/DROP TABLE/);
  });
});
