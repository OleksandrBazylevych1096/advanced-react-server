-- AlterTable
ALTER TABLE "public"."products" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
