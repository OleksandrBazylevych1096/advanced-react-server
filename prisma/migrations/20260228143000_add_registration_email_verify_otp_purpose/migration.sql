-- Add email registration OTP purpose
ALTER TYPE "public"."OtpPurpose" ADD VALUE IF NOT EXISTS 'REGISTRATION_EMAIL_VERIFY';
