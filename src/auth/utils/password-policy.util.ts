import { BadRequestException } from '@nestjs/common';
import { PASSWORD_POLICY_REGEX } from '../auth.constants';

export function assertStrongPassword(password: string): void {
  if (!PASSWORD_POLICY_REGEX.test(password)) {
    throw new BadRequestException({ code: 'PASSWORD_POLICY_VIOLATION' });
  }
}

