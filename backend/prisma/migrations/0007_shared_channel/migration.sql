-- Story: shared-channel. Creates Customer, SharedChannel, ChannelMember, Message.
-- Auth tables ("User", sessions, roles) are NOT altered.
-- Renumbered from 0006 (collided with 0006_vendor_onboarding); idempotent so it
-- is safe on a database where a partial copy may already exist.

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChannelMemberRole') THEN
        CREATE TYPE "ChannelMemberRole" AS ENUM ('VENDOR', 'CUSTOMER');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Customer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_userId_key" ON "Customer"("userId");
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Customer_userId_fkey') THEN
        ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SharedChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedChannel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SharedChannel_createdById_idx" ON "SharedChannel"("createdById");
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SharedChannel_createdById_fkey') THEN
        ALTER TABLE "SharedChannel" ADD CONSTRAINT "SharedChannel_createdById_fkey"
            FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ChannelMember" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ChannelMemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChannelMember_channelId_userId_key" ON "ChannelMember"("channelId", "userId");
CREATE INDEX IF NOT EXISTS "ChannelMember_userId_idx" ON "ChannelMember"("userId");
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChannelMember_channelId_fkey') THEN
        ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_channelId_fkey"
            FOREIGN KEY ("channelId") REFERENCES "SharedChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChannelMember_userId_fkey') THEN
        ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Message_channelId_createdAt_idx" ON "Message"("channelId", "createdAt");
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_channelId_fkey') THEN
        ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_fkey"
            FOREIGN KEY ("channelId") REFERENCES "SharedChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_authorId_fkey') THEN
        ALTER TABLE "Message" ADD CONSTRAINT "Message_authorId_fkey"
            FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
