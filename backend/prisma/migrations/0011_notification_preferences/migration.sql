-- Story: notification-preferences. Creates NotificationPreferenceChange
-- (effective-dated per-user order/message alert toggles).
-- Auth tables ("User", sessions, roles) and other stories' tables are NOT altered.

CREATE TABLE IF NOT EXISTS "NotificationPreferenceChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderAlerts" BOOLEAN NOT NULL DEFAULT true,
    "messageAlerts" BOOLEAN NOT NULL DEFAULT true,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationPreferenceChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NotificationPreferenceChange_userId_effectiveAt_idx"
    ON "NotificationPreferenceChange"("userId", "effectiveAt");
