-- CreateEnum
CREATE TYPE "public"."CheckoutSessionStatus" AS ENUM (
  'pending_payment',
  'paid',
  'payment_failed',
  'expired',
  'cancelled'
);

-- CreateTable
CREATE TABLE "public"."checkout_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cartHash" TEXT NOT NULL,
  "amount" DECIMAL(10, 2) NOT NULL,
  "currency" TEXT NOT NULL,
  "paymentIntentId" TEXT NOT NULL,
  "status" "public"."CheckoutSessionStatus" NOT NULL DEFAULT 'pending_payment',
  "shippingAmount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "discountAmount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "snapshot" JSONB NOT NULL,
  "orderId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "lastPaymentError" TEXT,
  "lastPaymentAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."checkout_session_events" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "fromStatus" "public"."CheckoutSessionStatus",
  "toStatus" "public"."CheckoutSessionStatus" NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkout_session_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkout_sessions_paymentIntentId_key"
ON "public"."checkout_sessions"("paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_sessions_orderId_key"
ON "public"."checkout_sessions"("orderId");

-- CreateIndex
CREATE INDEX "checkout_sessions_userId_cartHash_status_expiresAt_idx"
ON "public"."checkout_sessions"("userId", "cartHash", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "checkout_sessions_status_expiresAt_idx"
ON "public"."checkout_sessions"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "checkout_session_events_sessionId_createdAt_idx"
ON "public"."checkout_session_events"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."checkout_sessions"
ADD CONSTRAINT "checkout_sessions_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "public"."users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."checkout_sessions"
ADD CONSTRAINT "checkout_sessions_orderId_fkey"
FOREIGN KEY ("orderId")
REFERENCES "public"."orders"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."checkout_session_events"
ADD CONSTRAINT "checkout_session_events_sessionId_fkey"
FOREIGN KEY ("sessionId")
REFERENCES "public"."checkout_sessions"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
