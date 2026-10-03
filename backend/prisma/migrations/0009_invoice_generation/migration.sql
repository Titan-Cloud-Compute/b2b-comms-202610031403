-- Story: invoice-generation. Creates "Invoice" (one per CONFIRMED order).
-- Order / OrderItem (order-management) and auth tables are NOT altered;
-- orderId is a plain FK column. Idempotent so it is safe to re-run.

CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorUserId" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_orderId_key" ON "Invoice"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_number_key" ON "Invoice"("number");
CREATE INDEX IF NOT EXISTS "Invoice_vendorUserId_idx" ON "Invoice"("vendorUserId");
CREATE INDEX IF NOT EXISTS "Invoice_customerUserId_idx" ON "Invoice"("customerUserId");
