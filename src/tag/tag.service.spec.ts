import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TagService } from './tag.service';

describe('TagService', () => {
  it('resolves tags by base slug and returns localized slug map', async () => {
    const service = new TagService({
      tag: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tag-1',
          name: 'Organic',
          slug: 'organic',
          description: 'Organic products',
          translations: [
            {
              locale: 'de',
              name: 'Bio',
              slug: 'bio',
              description: 'Biologische Produkte',
            },
          ],
          _count: { products: 3 },
          products: [],
        }),
      },
      tagTranslation: {
        findFirst: jest.fn(),
      },
    } as any);

    await expect(service.findBySlug('organic', 'de')).resolves.toMatchObject({
      id: 'tag-1',
      name: 'Bio',
      slug: 'bio',
      slugMap: { en: 'organic', de: 'bio' },
      productCount: 3,
    });
  });

  it('resolves tags by translated slug when fallback slug is not matched', async () => {
    const service = new TagService({
      tag: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      tagTranslation: {
        findFirst: jest.fn().mockResolvedValue({
          tag: {
            id: 'tag-1',
            name: 'Organic',
            slug: 'organic',
            description: 'Organic products',
            translations: [
              {
                locale: 'de',
                name: 'Bio',
                slug: 'bio',
                description: 'Biologische Produkte',
              },
            ],
            _count: { products: 3 },
            products: [],
          },
        }),
      },
    } as any);

    await expect(service.findBySlug('bio', 'de')).resolves.toMatchObject({
      id: 'tag-1',
      name: 'Bio',
      slug: 'bio',
      slugMap: { en: 'organic', de: 'bio' },
    });
  });

  it('rejects duplicate translated slugs during tag creation', async () => {
    const service = new TagService({
      tag: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      tagTranslation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'translation-1',
          tagId: 'tag-1',
        }),
      },
    } as any);

    await expect(
      service.create({
        name: 'Organic',
        slug: 'organic',
        translations: [
          {
            locale: 'de',
            name: 'Bio',
            slug: 'bio',
          },
        ],
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws not found for an unknown slug', async () => {
    const service = new TagService({
      tag: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      tagTranslation: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any);

    await expect(service.findBySlug('missing', 'de')).rejects.toThrow(
      NotFoundException,
    );
  });
});
