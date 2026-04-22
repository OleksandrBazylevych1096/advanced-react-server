-- Add verification code safety fields
ALTER TABLE "verification_codes"
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "blockedAt" TIMESTAMP(3),
ADD COLUMN "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add order number counter table for race-free sequencing
CREATE TABLE "order_number_counters" (
    "dateKey" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_number_counters_pkey" PRIMARY KEY ("dateKey")
);

-- Add missing indexes
CREATE INDEX "verification_codes_userId_type_isUsed_expiresAt_idx"
ON "verification_codes"("userId", "type", "isUsed", "expiresAt");

CREATE INDEX "refresh_tokens_userId_idx"
ON "refresh_tokens"("userId");

CREATE INDEX "refresh_tokens_userId_revokedAt_expiresAt_idx"
ON "refresh_tokens"("userId", "revokedAt", "expiresAt");

CREATE INDEX "product_images_productId_idx"
ON "product_images"("productId");

CREATE INDEX "cart_items_userId_idx"
ON "cart_items"("userId");

-- Backfill passwordHash for legacy users
UPDATE "users"
SET "passwordHash" = "password"
WHERE "passwordHash" IS NULL
  AND "password" IS NOT NULL;

-- Conservatively backfill explicit verification flags from legacy isVerified
UPDATE "users"
SET
  "isEmailVerified" = CASE
    WHEN email IS NOT NULL AND "isVerified" = true THEN true
    ELSE "isEmailVerified"
  END,
  "isPhoneVerified" = CASE
    WHEN phone IS NOT NULL AND "isVerified" = true THEN true
    ELSE "isPhoneVerified"
  END
WHERE "isVerified" = true;
