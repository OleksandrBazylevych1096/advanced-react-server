-- AlterTable
ALTER TABLE "public"."order_items" ADD COLUMN     "productImage" TEXT,
ADD COLUMN     "productName" TEXT,
ADD COLUMN     "productSlug" TEXT;

-- CreateTable
CREATE TABLE "public"."cart_delivery_selection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "deliveryTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_delivery_selection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."order_status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "public"."OrderStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cart_delivery_selection_userId_key" ON "public"."cart_delivery_selection"("userId");

-- CreateIndex
CREATE INDEX "order_status_history_orderId_createdAt_idx" ON "public"."order_status_history"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."cart_delivery_selection" ADD CONSTRAINT "cart_delivery_selection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
