ALTER TABLE "orders"
  ADD COLUMN "tipAmount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "couponCode" TEXT;

ALTER TABLE "checkout_sessions"
  ADD COLUMN "tipAmount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "couponCode" TEXT;