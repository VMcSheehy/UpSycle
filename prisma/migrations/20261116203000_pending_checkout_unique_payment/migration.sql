-- CreateEnum
CREATE TYPE "PendingCheckoutStatus" AS ENUM ('OPEN', 'FULFILLED', 'REFUNDED');

-- AlterTable
-- A real Stripe charge can create only one order. Existing nulls stay valid.
CREATE UNIQUE INDEX "orders_stripePaymentId_key" ON "orders"("stripePaymentId");

-- AlterTable
CREATE UNIQUE INDEX "featured_slot_purchases_stripePaymentId_key" ON "featured_slot_purchases"("stripePaymentId");

-- CreateTable
CREATE TABLE "pending_checkouts" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "shippingAddressId" TEXT,
    "totalAmountCents" INTEGER NOT NULL,
    "linesJson" JSONB NOT NULL,
    "status" "PendingCheckoutStatus" NOT NULL DEFAULT 'OPEN',
    "stripePaymentId" TEXT,
    "refundDueCents" INTEGER NOT NULL DEFAULT 0,
    "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_checkouts_stripePaymentId_key" ON "pending_checkouts"("stripePaymentId");

-- CreateIndex
CREATE INDEX "pending_checkouts_buyerId_idx" ON "pending_checkouts"("buyerId");

-- AddForeignKey
ALTER TABLE "pending_checkouts" ADD CONSTRAINT "pending_checkouts_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
