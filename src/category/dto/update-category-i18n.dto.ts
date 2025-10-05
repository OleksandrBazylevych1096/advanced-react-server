import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoryI18nDto } from './create-category-i18n.dto';

export class UpdateCategoryI18nDto extends PartialType(CreateCategoryI18nDto) {}
