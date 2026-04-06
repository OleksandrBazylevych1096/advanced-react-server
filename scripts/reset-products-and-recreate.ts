import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductService } from '../src/product/product.service';

type SnapshotProduct = {
  name: string;
  slug: string;
  shortDescription?: string;
  description?: string;
  price: number;
  oldPrice?: number;
  stock: number;
  categoryIds: string[];
  tagIds: string[];
  images: Array<{
    url: string;
    alt?: string;
    isMain?: boolean;
    order?: number;
  }>;
  translations: Array<{
    locale: string;
    name: string;
    slug: string;
    shortDescription?: string;
    description?: string;
  }>;
  brand?: string;
  country?: string;
  isActive?: boolean;
};

async function main() {
  const shouldDropOrders = process.argv.includes('--drop-orders');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const productService = app.get(ProductService);

    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        categories: { select: { id: true } },
        tags: { select: { id: true } },
        images: {
          select: {
            url: true,
            alt: true,
            isMain: true,
            order: true,
          },
          orderBy: [{ isMain: 'desc' }, { order: 'asc' }],
        },
        translations: {
          select: {
            locale: true,
            name: true,
            slug: true,
            shortDescription: true,
            description: true,
          },
          orderBy: { locale: 'asc' },
        },
      },
    });

    if (!products.length) {
      console.log('No products found. Nothing to recreate.');
      return;
    }

    const productIds = products.map((p) => p.id);
    const orderItemsCount = await prisma.orderItem.count({
      where: { productId: { in: productIds } },
    });

    if (orderItemsCount > 0) {
      if (!shouldDropOrders) {
        throw new Error(
          `Reset aborted: found ${orderItemsCount} order_items referencing current products. Re-run with --drop-orders to delete order history first.`,
        );
      }

      console.log(
        `Deleting order history first because ${orderItemsCount} order_items reference current products...`,
      );
      await prisma.order.deleteMany({});

      const leftOrderItems = await prisma.orderItem.count({
        where: { productId: { in: productIds } },
      });
      if (leftOrderItems > 0) {
        throw new Error(
          `Failed to clean order history. ${leftOrderItems} order_items still reference current products.`,
        );
      }
    }

    if (orderItemsCount > 0 && shouldDropOrders) {
      console.log('Order history deleted.');
    } else if (orderItemsCount > 0) {
      throw new Error(
        `Reset aborted: found ${orderItemsCount} order_items referencing current products.`,
      );
    }

    const snapshot: SnapshotProduct[] = products.map((p) => ({
      name: p.name,
      slug: p.slug,
      shortDescription: p.shortDescription || undefined,
      description: p.description || undefined,
      price: Number(p.price),
      oldPrice: p.oldPrice === null ? undefined : Number(p.oldPrice),
      stock: p.stock,
      categoryIds: p.categories.map((c) => c.id),
      tagIds: p.tags.map((t) => t.id),
      images: p.images.map((i) => ({
        url: i.url,
        alt: i.alt || undefined,
        isMain: i.isMain || undefined,
        order: i.order ?? undefined,
      })),
      translations: p.translations.map((t) => ({
        locale: t.locale,
        name: t.name,
        slug: t.slug,
        shortDescription: t.shortDescription || undefined,
        description: t.description || undefined,
      })),
      brand: p.brand || undefined,
      country: p.country || undefined,
      isActive: p.isActive,
    }));

    console.log(`Snapshot captured: ${snapshot.length} products.`);
    console.log('Deleting current products...');
    await prisma.product.deleteMany({});

    console.log('Recreating products via ProductService (with Stripe sync)...');
    let created = 0;
    for (const item of snapshot) {
      await productService.create({
        name: item.name,
        slug: item.slug,
        shortDescription: item.shortDescription,
        description: item.description,
        price: item.price,
        oldPrice: item.oldPrice,
        stock: item.stock,
        categoryIds: item.categoryIds,
        tagIds: item.tagIds,
        images: item.images,
        translations: item.translations,
        brand: item.brand,
        country: item.country,
        isActive: item.isActive,
      } as any);
      created += 1;
      if (created % 10 === 0 || created === snapshot.length) {
        console.log(`Recreated ${created}/${snapshot.length}`);
      }
    }

    console.log(`Done. Recreated ${created} products.`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
