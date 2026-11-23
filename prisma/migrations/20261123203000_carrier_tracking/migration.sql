-- AlterEnum
ALTER TYPE "ShippingStatus" ADD VALUE 'IN_TRANSIT';
ALTER TYPE "ShippingStatus" ADD VALUE 'OUT_FOR_DELIVERY';
ALTER TYPE "ShippingStatus" ADD VALUE 'EXCEPTION';

-- CreateEnum
CREATE TYPE "ShippingCarrier" AS ENUM ('USPS', 'UPS', 'FEDEX', 'DHL');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "carrier" "ShippingCarrier";
ALTER TABLE "order_items" ADD COLUMN "trackingNumber" TEXT;
ALTER TABLE "order_items" ADD COLUMN "trackingUrl" TEXT;
ALTER TABLE "order_items" ADD COLUMN "trackingProvider" TEXT;
ALTER TABLE "order_items" ADD COLUMN "providerTrackerId" TEXT;

-- CreateIndex
CREATE INDEX "order_items_providerTrackerId_idx" ON "order_items"("providerTrackerId");
CREATE INDEX "order_items_carrier_trackingNumber_idx" ON "order_items"("carrier", "trackingNumber");

-- CreateTable
CREATE TABLE "tracking_events" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "carrierStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tracking_events_providerEventId_key" ON "tracking_events"("providerEventId");
CREATE INDEX "tracking_events_orderItemId_idx" ON "tracking_events"("orderItemId");

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
