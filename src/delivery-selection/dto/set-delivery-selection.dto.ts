import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

export class SetDeliverySelectionDto {
  @IsDateString()
  deliveryDate: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'deliveryTime must be in HH:mm format',
  })
  deliveryTime: string;

  @IsOptional()
  @IsString()
  addressId?: string;
}
