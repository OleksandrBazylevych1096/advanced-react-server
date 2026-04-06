import { BadRequestException } from '@nestjs/common';

export type IdentifierType = 'email' | 'phone';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function detectIdentifierType(identifier: string): IdentifierType {
  const normalized = (identifier || '').trim();
  if (EMAIL_REGEX.test(normalized)) return 'email';
  if (E164_REGEX.test(normalized)) return 'phone';
  throw new BadRequestException({ code: 'INVALID_IDENTIFIER' });
}

export function normalizeIdentifier(identifier: string): string {
  return (identifier || '').trim();
}

export function isE164Phone(phone?: string | null): boolean {
  return !!phone && E164_REGEX.test(phone.trim());
}

export function isEmailAddress(email?: string | null): boolean {
  return !!email && EMAIL_REGEX.test(email.trim().toLowerCase());
}

