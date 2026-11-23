-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "refundedAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "order_items" ADD COLUMN "stripeRefundId" TEXT;

-- One open lottery window. A second Saturday run cannot insert another PENDING period.
CREATE UNIQUE INDEX "placement_periods_one_pending" ON "placement_periods" ("status") WHERE "status" = 'PENDING';
