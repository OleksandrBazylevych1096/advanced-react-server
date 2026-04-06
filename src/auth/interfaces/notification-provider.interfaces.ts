export interface EmailProvider {
  sendVerificationLink(email: string, link: string): Promise<void>;
  sendOtp(email: string, code: string): Promise<void>;
  sendPasswordResetLink(email: string, link: string): Promise<void>;
  sendSecurityAlert(email: string, subject: string, message: string): Promise<void>;
}

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}

