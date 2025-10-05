import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class AssignTagsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  tagIds: string[];
}

export class CreateTagsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  tagNames: string[];
}
