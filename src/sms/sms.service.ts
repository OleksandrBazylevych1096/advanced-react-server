import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Vonage } from '@vonage/server-sdk';

@Injectable()
export class SmsService {
  private vonage: Vonage;

  constructor(private configService: ConfigService) {
    //@ts-expect-error requires arguments it doesnt need
    this.vonage = new Vonage({
      apiKey: this.configService.get('VONAGE_API_KEY'),
      apiSecret: this.configService.get('VONAGE_API_SECRET'),
    });
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const from = this.configService.get('VONAGE_FROM') || 'Verify';

    try {
      const response = await this.vonage.sms.send({
        to,
        from,
        text: code,
      });

      const [message] = response.messages;

      if (message.status !== '0') {
        console.error('Vonage SMS error:', message['error-text']);
        throw new BadRequestException({ code: 'SMS_DELIVERY_FAILED' });
      }
    } catch (error) {
      console.error('Vonage send error:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException({ code: 'SMS_SERVICE_ERROR' });
    }
  }
}
