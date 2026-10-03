-- Story: customer-invite. Creates CustomerInvitation (single-use, expiring).
-- Auth tables ("User", sessions, roles) are NOT altered. Idempotent.
-- Renumbered from 0008 (collided with 0008_order_management).

CREATE TABLE IF NOT EXISTS "CustomerInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "companyName" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerInvitation_tokenHash_key" ON "CustomerInvitation"("tokenHash");
CREATE INDEX IF NOT EXISTS "CustomerInvitation_email_idx" ON "CustomerInvitation"("email");
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerInvitation_invitedById_fkey') THEN
        ALTER TABLE "CustomerInvitation" ADD CONSTRAINT "CustomerInvitation_invitedById_fkey"
            FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerInvitation_acceptedUserId_fkey') THEN
        ALTER TABLE "CustomerInvitation" ADD CONSTRAINT "CustomerInvitation_acceptedUserId_fkey"
            FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
