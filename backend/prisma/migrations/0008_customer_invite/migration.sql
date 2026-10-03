-- Story: customer-invite. Creates CustomerInvitation (single-use, expiring).
-- Auth tables ("User", sessions, roles) are NOT altered. Idempotent.

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
