import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class AuthCryptoService {
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const raw = configService.get<string>('DATA_ENCRYPTION_KEY_BASE64') || '';
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error('DATA_ENCRYPTION_KEY_BASE64 must be 32 bytes (base64)');
    }
    this.key = key;
  }

  encrypt(plainText: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [version, ivB64, tagB64, cipherB64] = (payload || '').split(':');
    if (version !== 'v1' || !ivB64 || !tagB64 || !cipherB64) {
      throw new Error('Invalid encrypted payload format');
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(cipherB64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  }
}

