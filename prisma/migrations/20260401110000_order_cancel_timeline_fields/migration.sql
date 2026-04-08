ALTER TABLE "orders"
ADD COLUMN "cancelledFromStatus" "OrderStatus",
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "refundedAt" TIMESTAMP(3);
