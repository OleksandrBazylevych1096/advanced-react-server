import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryI18nDto } from './dto/create-category-i18n.dto';
import { UpdateCategoryI18nDto } from './dto/update-category-i18n.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaService) {}

  private getIncludeWithTranslations(locale?: string) {
    return {
      parent: {
        include: {
          translations: locale ? { where: { locale } } : true,
        },
      },
      children: {
        where: { isActive: true },
        include: {
          translations: locale ? { where: { locale } } : true,
          _count: {
            select: {
              products: true,
            },
          },
        },
      },
      translations: locale ? { where: { locale } } : true,
      _count: {
        select: {
          products: true,
        },
      },
    };
  }

  private transformCategoryWithTranslation(
    category: any,
    locale: string = 'en',
  ) {
    const translation =
      category.translations?.find((t: any) => t.locale === locale) ||
      category.translations?.[0];

    if (translation) {
      category.name = translation.name;
      category.slug = translation.slug;
      category.description = translation.description;
    }

    if (category.parent) {
      const parentTranslation =
        category.parent.translations?.find((t: any) => t.locale === locale) ||
        category.parent.translations?.[0];

      if (parentTranslation) {
        category.parent.name = parentTranslation.name;
        category.parent.slug = parentTranslation.slug;
        category.parent.description = parentTranslation.description;
      }
      delete category.parent.translations;
    }

    if (category.children) {
      category.children = category.children.map((child: any) => {
        const childTranslation =
          child.translations?.find((t: any) => t.locale === locale) ||
          child.translations?.[0];

        if (childTranslation) {
          child.name = childTranslation.name;
          child.slug = childTranslation.slug;
          child.description = childTranslation.description;
        }
        delete child.translations;
        return child;
      });
    }

    delete category.translations;
    return category;
  }

  async create(createCategoryDto: CreateCategoryI18nDto) {
    const { translations, ...categoryData } = createCategoryDto;

    // Check if name already exists
    const existingName = await this.prisma.category.findUnique({
      where: { name: categoryData.name },
    });

    if (existingName) {
      throw new BadRequestException('Category with this name already exists');
    }

    // Check if slug already exists
    const existingSlug = await this.prisma.category.findUnique({
      where: { slug: categoryData.slug },
    });

    if (existingSlug) {
      throw new BadRequestException('Category with this slug already exists');
    }

    // Check translations slugs
    if (translations && translations.length > 0) {
      for (const translation of translations) {
        const existingTranslation =
          await this.prisma.categoryTranslation.findFirst({
            where: {
              locale: translation.locale,
              slug: translation.slug,
            },
          });

        if (existingTranslation) {
          throw new BadRequestException(
            `Category with slug "${translation.slug}" already exists for locale "${translation.locale}"`,
          );
        }
      }
    }

    // Check if parent exists (if provided)
    if (categoryData.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: categoryData.parentId },
      });

      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    return this.prisma.category.create({
      data: {
        ...categoryData,
        translations: {
          create: translations,
        },
      },
      include: this.getIncludeWithTranslations(),
    });
  }

  async findAll(includeInactive: boolean = false, locale: string = 'en') {
    const where = includeInactive ? {} : { isActive: true };

    const categories = await this.prisma.category.findMany({
      where,
      include: this.getIncludeWithTranslations(locale),
      orderBy: {
        name: 'asc',
      },
    });

    return categories.map((category) =>
      this.transformCategoryWithTranslation(category, locale),
    );
  }

  async findOne(id: string, locale: string = 'en') {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        ...this.getIncludeWithTranslations(locale),
        products: {
          include: {
            images: true,
            _count: {
              select: {
                reviews: true,
                favoriteProducts: true,
              },
            },
          },
          take: 12,
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return this.transformCategoryWithTranslation(category, locale);
  }

  async findBySlug(slug: string, locale: string = 'en') {
    // First try to find by main category slug
    let category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        ...this.getIncludeWithTranslations(locale),
        products: {
          include: {
            images: true,
            _count: {
              select: {
                reviews: true,
                favoriteProducts: true,
              },
            },
          },
          take: 12,
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    // If not found, try to find by translation slug
    if (!category) {
      const translation = await this.prisma.categoryTranslation.findFirst({
        where: { slug },
        include: {
          category: {
            include: {
              ...this.getIncludeWithTranslations(locale),
              products: {
                include: {
                  images: true,
                  _count: {
                    select: {
                      reviews: true,
                      favoriteProducts: true,
                    },
                  },
                },
                take: 12,
                orderBy: {
                  createdAt: 'desc',
                },
              },
            },
          },
        },
      });

      if (translation) {
        category = translation.category;
      }
    }

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return this.transformCategoryWithTranslation(category, locale);
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    const existingCategory = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      throw new NotFoundException('Category not found');
    }

    // Check for unique constraints if updating
    if (
      updateCategoryDto.name &&
      updateCategoryDto.name !== existingCategory.name
    ) {
      const existingName = await this.prisma.category.findUnique({
        where: { name: updateCategoryDto.name },
      });

      if (existingName) {
        throw new BadRequestException('Category with this name already exists');
      }
    }

    if (
      updateCategoryDto.slug &&
      updateCategoryDto.slug !== existingCategory.slug
    ) {
      const existingSlug = await this.prisma.category.findUnique({
        where: { slug: updateCategoryDto.slug },
      });

      if (existingSlug) {
        throw new BadRequestException('Category with this slug already exists');
      }
    }

    // Check if parent exists and prevent circular reference
    if (updateCategoryDto.parentId) {
      if (updateCategoryDto.parentId === id) {
        throw new BadRequestException('Category cannot be its own parent');
      }

      const parent = await this.prisma.category.findUnique({
        where: { id: updateCategoryDto.parentId },
      });

      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }

      // Check for circular references in the hierarchy
      await this.checkCircularReference(id, updateCategoryDto.parentId);
    }

    return this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
      include: {
        parent: {
          include: {
            translations: true,
          },
        },
        children: {
          include: {
            translations: true,
          },
        },
        translations: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
    });
  }

  private async checkCircularReference(
    categoryId: string,
    potentialParentId: string,
  ): Promise<void> {
    let currentParentId = potentialParentId;

    while (currentParentId) {
      if (currentParentId === categoryId) {
        throw new BadRequestException(
          'Circular reference detected in category hierarchy',
        );
      }

      const parent = await this.prisma.category.findUnique({
        where: { id: currentParentId },
        select: { parentId: true },
      });

      currentParentId = parent?.parentId || '';
    }
  }

  async remove(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        children: true,
        products: true,
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Check if category has products
    if (category.products.length > 0) {
      throw new BadRequestException('Cannot delete category with products');
    }

    // Check if category has children
    if (category.children.length > 0) {
      throw new BadRequestException(
        'Cannot delete category with subcategories',
      );
    }

    return this.prisma.category.delete({
      where: { id },
    });
  }

  async getTopLevelCategories(locale: string = 'en') {
    console.log(1);

    const categories = await this.prisma.category.findMany({
      where: {
        parentId: null,
        isActive: true,
      },
      include: this.getIncludeWithTranslations(locale),
      orderBy: {
        name: 'asc',
      },
    });

    return categories.map((category) =>
      this.transformCategoryWithTranslation(category, locale),
    );
  }

  async getCategoryTree(locale: string = 'en') {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      include: this.getIncludeWithTranslations(locale),
      orderBy: {
        name: 'asc',
      },
    });

    // Transform categories before building tree
    const transformedCategories = categories.map((category) =>
      this.transformCategoryWithTranslation({ ...category }, locale),
    );

    // Build tree structure using transformed categories
    const categoryMap = new Map<string, any>();
    transformedCategories.forEach((category) => {
      categoryMap.set(category.id, { ...category, children: [] });
    });

    const tree: any[] = [];
    transformedCategories.forEach((category) => {
      if (category.parentId) {
        const parent = categoryMap.get(category.parentId);
        if (parent) {
          parent.children.push(categoryMap.get(category.id));
        }
      } else {
        tree.push(categoryMap.get(category.id));
      }
    });

    return tree;
  }
}
