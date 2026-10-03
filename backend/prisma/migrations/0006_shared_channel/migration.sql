-- Story: shared-channel. Creates Customer, SharedChannel, ChannelMember, Message.
-- Auth tables ("User", sessions, roles) are NOT altered.

CREATE TYPE "ChannelMemberRole" AS ENUM ('VENDOR', 'CUSTOMER');

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SharedChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedChannel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SharedChannel_createdById_idx" ON "SharedChannel"("createdById");
ALTER TABLE "SharedChannel" ADD CONSTRAINT "SharedChannel_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChannelMember" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ChannelMemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChannelMember_channelId_userId_key" ON "ChannelMember"("channelId", "userId");
CREATE INDEX "ChannelMember_userId_idx" ON "ChannelMember"("userId");
ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "SharedChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Message_channelId_createdAt_idx" ON "Message"("channelId", "createdAt");
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "SharedChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
