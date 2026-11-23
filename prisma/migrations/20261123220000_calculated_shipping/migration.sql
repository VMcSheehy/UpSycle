-- AlterTable
ALTER TABLE "seller_profiles" ADD COLUMN "shipFromName" TEXT;
ALTER TABLE "seller_profiles" ADD COLUMN "shipFromLine1" TEXT;
ALTER TABLE "seller_profiles" ADD COLUMN "shipFromLine2" TEXT;
ALTER TABLE "seller_profiles" ADD COLUMN "shipFromCity" TEXT;
ALTER TABLE "seller_profiles" ADD COLUMN "shipFromState" TEXT;
ALTER TABLE "seller_profiles" ADD COLUMN "shipFromPostalCode" TEXT;
ALTER TABLE "seller_profiles" ADD COLUMN "shipFromCountry" TEXT NOT NULL DEFAULT 'US';

-- AlterTable
ALTER TABLE "products" ADD COLUMN "packagePreset" TEXT;
ALTER TABLE "products" ADD COLUMN "parcelLengthTenths" INTEGER;
ALTER TABLE "products" ADD COLUMN "parcelWidthTenths" INTEGER;
ALTER TABLE "products" ADD COLUMN "parcelHeightTenths" INTEGER;
ALTER TABLE "products" ADD COLUMN "parcelWeightTenths" INTEGER;
ALTER TABLE "products" ADD COLUMN "needsFreightQuote" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "pending_checkouts" ADD COLUMN "shipmentsJson" JSONB;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "shipmentId" TEXT;

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sellerProfileId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "carrier" TEXT,
    "service" TEXT,
    "speed" TEXT,
    "easypostShipmentId" TEXT,
    "easypostRateId" TEXT,
    "labelCostCents" INTEGER NOT NULL,
    "buyerShippingCents" INTEGER NOT NULL,
    "insuranceCents" INTEGER NOT NULL DEFAULT 0,
    "buyerChargeCents" INTEGER NOT NULL,
    "marginCents" INTEGER NOT NULL,
    "insured" BOOLEAN NOT NULL DEFAULT false,
    "trackingNumber" TEXT,
    "labelUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_quotes" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerProfileId" TEXT NOT NULL,
    "easypostShipmentId" TEXT NOT NULL,
    "ratesJson" JSONB NOT NULL,
    "merchandiseCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_quote_requests" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sellerProfileId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_quote_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipping_quotes_buyerId_sellerProfileId_idx" ON "shipping_quotes"("buyerId", "sellerProfileId");
CREATE INDEX "shipments_orderId_idx" ON "shipments"("orderId");
CREATE INDEX "order_items_shipmentId_idx" ON "order_items"("shipmentId");
CREATE INDEX "shipping_quote_requests_sellerProfileId_idx" ON "shipping_quote_requests"("sellerProfileId");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_sellerProfileId_fkey" FOREIGN KEY ("sellerProfileId") REFERENCES "seller_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "shipping_quote_requests" ADD CONSTRAINT "shipping_quote_requests_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipping_quote_requests" ADD CONSTRAINT "shipping_quote_requests_sellerProfileId_fkey" FOREIGN KEY ("sellerProfileId") REFERENCES "seller_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
