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

  private async getBreadcrumbs(
    categoryId: string,
    locale: string,
  ): Promise<{ id: string; name: string; slug: string }[]> {
    // Явно вказуємо тип для масиву breadcrumbs
    const breadcrumbs: { id: string; name: string; slug: string }[] = [];

    // Змінюємо тип currentId на string | null
    let currentId: string | null = categoryId;

    // Проходимо по дереву вгору, поки є батьківські категорії (currentId не null)
    while (currentId) {
      const category = await this.prisma.category.findUnique({
        where: { id: currentId },
        include: {
          translations: locale ? { where: { locale } } : true,
          parent: true, // Включаємо parent, щоб отримати parentId коректно
        },
      });

      if (!category) break;

      // Використовуємо існуючу логіку трансформації для отримання правильної назви/slug
      // Важливо: для getBreadcrumbs нам потрібні лише name, slug та id.
      const transformed = this.transformCategoryWithTranslation(
        { ...category },
        locale,
      );

      // Перевіряємо, чи існують id, name та slug перед додаванням
      if (transformed.id && transformed.name && transformed.slug) {
        // Додаємо на початок масиву (щоб порядок був: Root -> Child -> Current)
        breadcrumbs.unshift({
          id: transformed.id,
          // Примусове приведення до string, оскільки трансформація гарантує їх наявність
          name: transformed.name as string,
          slug: transformed.slug as string,
        });
      }

      // Оновлюємо currentId. Тепер currentId може бути string або null.
      currentId = category.parentId;
    }

    return breadcrumbs;
  }

  async getBreadcrumbsBySlug(slug: string, locale: string = 'en') {
    // 1. Знайти категорію за основним slug
    let category = await this.prisma.category.findUnique({
      where: { slug },
      select: { id: true }, // Нам потрібен лише ID
    });

    // 2. Якщо не знайдено, знайти за slug перекладу
    if (!category) {
      const translation = await this.prisma.categoryTranslation.findFirst({
        where: { slug },
        select: { categoryId: true },
      });

      if (translation) {
        category = { id: translation.categoryId };
      }
    }

    if (!category) {
      throw new NotFoundException(`Category with slug "${slug}" not found`);
    }

    // 3. Побудувати та повернути хлібні крихти
    return this.getBreadcrumbs(category.id, locale);
  }
  // -----------------------------------

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

  async findChildrenBySlug(slug: string, locale: string = 'en') {
    // 1. Try main slug
    let category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
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
          orderBy: {
            name: 'asc',
          },
        },
      },
    });

    // 2. Try translation slug
    if (!category) {
      const translation = await this.prisma.categoryTranslation.findFirst({
        where: { slug },
        include: {
          category: {
            include: {
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
                orderBy: {
                  name: 'asc',
                },
              },
            },
          },
        },
      });

      category = translation?.category ?? null;
    }

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // 3. Transform children only
    return category.children.map((child: any) =>
      this.transformCategoryWithTranslation(child, locale),
    );
  }

  private async findActiveCategoryBySlugWithParent(
    slug: string,
    locale: string,
  ) {
    let category = await this.prisma.category.findFirst({
      where: { slug, isActive: true },
      include: {
        parent: {
          include: {
            translations: locale ? { where: { locale } } : true,
            _count: { select: { products: true } },
          },
        },
        translations: locale ? { where: { locale } } : true,
        _count: { select: { products: true } },
      },
    });

    if (category) return category;

    const translation = await this.prisma.categoryTranslation.findFirst({
      where: { slug, category: { isActive: true } },
      include: {
        category: {
          include: {
            parent: {
              include: {
                translations: locale ? { where: { locale } } : true,
                _count: { select: { products: true } },
              },
            },
            translations: locale ? { where: { locale } } : true,
            _count: { select: { products: true } },
          },
        },
      },
    });

    return translation?.category ?? null;
  }

  private async getTopLevelCategoriesBySearch(search: string, locale: string) {
    const normalizedSearch = search.trim();

    if (!normalizedSearch) {
      return [];
    }

    const matchedCategories = await this.prisma.category.findMany({
      where: {
        isActive: true,
        products: {
          some: {
            isActive: true,
            OR: [
              { name: { contains: normalizedSearch, mode: 'insensitive' } },
              { slug: { contains: normalizedSearch, mode: 'insensitive' } },
              {
                translations: {
                  some: {
                    locale,
                    OR: [
                      {
                        name: {
                          contains: normalizedSearch,
                          mode: 'insensitive',
                        },
                      },
                      {
                        slug: {
                          contains: normalizedSearch,
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
      select: {
        id: true,
        parentId: true,
      },
    });

    if (!matchedCategories.length) {
      return [];
    }

    const categoryById = new Map<
      string,
      {
        id: string;
        parentId: string | null;
      }
    >();

    matchedCategories.forEach((category) => {
      categoryById.set(category.id, category);
    });

    let unresolvedParentIds = new Set(
      matchedCategories
        .map((category) => category.parentId)
        .filter((parentId): parentId is string => Boolean(parentId)),
    );

    while (unresolvedParentIds.size > 0) {
      const idsToLoad = Array.from(unresolvedParentIds).filter(
        (id) => !categoryById.has(id),
      );

      if (!idsToLoad.length) {
        break;
      }

      const parents = await this.prisma.category.findMany({
        where: {
          id: { in: idsToLoad },
          isActive: true,
        },
        select: {
          id: true,
          parentId: true,
        },
      });

      unresolvedParentIds = new Set<string>();

      parents.forEach((parent) => {
        categoryById.set(parent.id, parent);
        if (parent.parentId) {
          unresolvedParentIds.add(parent.parentId);
        }
      });
    }

    const topLevelIds = new Set<string>();

    matchedCategories.forEach((category) => {
      let current = categoryById.get(category.id);
      while (current?.parentId) {
        const parent = categoryById.get(current.parentId);
        if (!parent) break;
        current = parent;
      }

      if (current && !current.parentId) {
        topLevelIds.add(current.id);
      }
    });

    if (!topLevelIds.size) {
      return [];
    }

    const topLevelCategories = await this.prisma.category.findMany({
      where: {
        id: { in: Array.from(topLevelIds) },
        parentId: null,
        isActive: true,
      },
      include: this.getIncludeWithTranslations(locale),
      orderBy: {
        name: 'asc',
      },
    });

    return topLevelCategories.map((cat) =>
      this.transformCategoryWithTranslation(cat, locale),
    );
  }

  async getCategoryNavigation(
    slug?: string,
    locale: string = 'en',
    search?: string,
  ) {
    const normalizedSearch = search?.trim();

    if (normalizedSearch) {
      const items = await this.getTopLevelCategoriesBySearch(
        normalizedSearch,
        locale,
      );

      return {
        currentCategory: null,
        parentCategory: null,
        items,
        isShowingSubcategories: false,
        breadcrumbs: [],
      };
    }

    if (slug) {
      const category = await this.findActiveCategoryBySlugWithParent(
        slug,
        locale,
      );

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      const children = await this.prisma.category.findMany({
        where: {
          parentId: category.id,
          isActive: true,
        },
        include: this.getIncludeWithTranslations(locale),
        orderBy: {
          name: 'asc',
        },
      });

      const breadcrumbs = await this.getBreadcrumbs(category.id, locale);

      return {
        currentCategory: this.transformCategoryWithTranslation(
          { ...category },
          locale,
        ),
        parentCategory: category.parent
          ? this.transformCategoryWithTranslation({ ...category.parent }, locale)
          : null,
        items: children.map((child) =>
          this.transformCategoryWithTranslation(child, locale),
        ),
        isShowingSubcategories: true,
        breadcrumbs,
      };
    }

    const items = await this.getTopLevelCategories(locale);

    return {
      currentCategory: null,
      parentCategory: null,
      items,
      isShowingSubcategories: false,
      breadcrumbs: [],
    };
  }
}

