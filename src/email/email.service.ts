import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST'),
      port: this.configService.get('SMTP_PORT'),
      secure: true,
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASSWORD'),
      },
    });
  }

  async sendOrderConfirmation(to: string, payload: any): Promise<void> {
    const mailOptions = {
      from: this.configService.get('SMTP_FROM'),
      to,
      subject: `Order Confirmation - ${payload.orderNumber}`,
      text: `Your order ${payload.orderNumber} has been confirmed. Total: ${payload.total} ${payload.currency}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Order Confirmation</h2>
          <p>Your order <strong>${payload.orderNumber}</strong> has been successfully confirmed.</p>
          <p>Total: ${payload.total} ${payload.currency}</p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      this.logger.error(
        'Failed to send order confirmation email',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const mailOptions = {
      from: this.configService.get('SMTP_FROM'),
      to,
      subject: 'Verification Code',
      text: `Your verification code is: ${code}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verification Code</h2>
          <p>Please use the following code to verify your account:</p>
          <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
            ${code}
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      this.logger.error(
        'Failed to send email',
        error instanceof Error ? error.stack : undefined,
      );
      if (error.code === 'ECONNREFUSED') {
        throw new BadRequestException({ code: 'EMAIL_SERVER_UNAVAILABLE' });
      } else if (error.code === 'EAUTH') {
        throw new BadRequestException({ code: 'EMAIL_AUTH_ERROR' });
      }
      throw new BadRequestException({ code: 'EMAIL_DELIVERY_FAILED' });
    }
  }
}
