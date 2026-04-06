import { IsBoolean } from 'class-validator';

export class UpdateEmailNotificationsDto {
  @IsBoolean()
  enabled: boolean;
}
