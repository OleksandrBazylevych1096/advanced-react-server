import { Module } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailService } from '../email/email.service';
import { EmailModule } from '../email/email.module';
import { SmsService } from '../sms/sms.service';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [PrismaModule, EmailModule, SmsModule],
  providers: [VerificationService, EmailService, SmsService],
  exports: [VerificationService],
})
export class VerificationModule {}
