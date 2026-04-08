-- AlterTable
ALTER TABLE "public"."orders" ADD COLUMN     "deliveryDate" TIMESTAMP(3),
ADD COLUMN     "deliveryTime" TEXT,
ADD COLUMN     "stripePaymentIntentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_stripePaymentIntentId_key" ON "public"."orders"("stripePaymentIntentId");

