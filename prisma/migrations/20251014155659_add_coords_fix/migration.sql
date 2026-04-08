/*
  Warnings:

  - You are about to drop the column `longitude` on the `shipping_addresses` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."shipping_addresses" DROP COLUMN "longitude",
ADD COLUMN     "longtitude" DOUBLE PRECISION;
