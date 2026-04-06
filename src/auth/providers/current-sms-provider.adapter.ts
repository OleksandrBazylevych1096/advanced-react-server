import { Injectable } from '@nestjs/common';
import { SmsService } from 'src/sms/sms.service';
import { SmsProvider } from '../interfaces/notification-provider.interfaces';

@Injectable()
export class CurrentSmsProviderAdapter implements SmsProvider {
  constructor(private readonly smsService: SmsService) {}

  sendOtp(phone: string, code: string): Promise<void> {
    return this.smsService.sendVerificationCode(phone, code);
  }
}

