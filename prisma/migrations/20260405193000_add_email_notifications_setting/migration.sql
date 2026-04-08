-- AlterTable
ALTER TABLE "public"."users"
ADD COLUMN "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
