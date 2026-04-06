import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class SyncSearchHistoryDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  queries: string[];
}
