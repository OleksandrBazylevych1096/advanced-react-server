import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create promo banners
  const promoBanners = await Promise.all([
    prisma.promoBanner.upsert({
      where: { id: 'banner-1' },
      update: {},
      create: {
        id: 'banner-1',
        imageUrl: 'http://localhost:3000/static/banner1.jpg',
        title: 'Summer Collection',
        description: 'Check out our new summer collection',
        link: '/summer-collection',
        isActive: true,
      },
    }),
    prisma.promoBanner.upsert({
      where: { id: 'banner-2' },
      update: {},
      create: {
        id: 'banner-2',
        imageUrl: 'http://localhost:3000/static/banner2.png',
        title: 'Special Offer',
        description: 'Get 20% off on selected items',
        link: '/special-offers',
        isActive: true,
      },
    }),
    prisma.promoBanner.upsert({
      where: { id: 'banner-3' },
      update: {},
      create: {
        id: 'banner-3',
        imageUrl: 'http://localhost:3000/static/banner3.png',
        title: 'New Arrivals',
        description: 'Discover our latest products',
        link: '/new-arrivals',
        isActive: true,
      },
    }),
    prisma.promoBanner.upsert({
      where: { id: 'banner-4' },
      update: {},
      create: {
        id: 'banner-4',
        imageUrl: 'http://localhost:3000/static/banner4.jpg',
        title: 'Premium Quality',
        description: 'Experience our premium product line',
        link: '/premium',
        isActive: true,
      },
    }),
    prisma.promoBanner.upsert({
      where: { id: 'banner-5' },
      update: {},
      create: {
        id: 'banner-5',
        imageUrl: 'http://localhost:3000/static/banner1.jpg',
        title: 'Local Products',
        description: 'Support local farmers and producers',
        link: '/local',
        isActive: true,
      },
    }),
    prisma.promoBanner.upsert({
      where: { id: 'banner-6' },
      update: {},
      create: {
        id: 'banner-6',
        imageUrl: 'http://localhost:3000/static/banner2.png',
        title: 'Organic Selection',
        description: 'Fresh organic products for healthy living',
        link: '/organic',
        isActive: true,
      },
    }),
    prisma.promoBanner.upsert({
      where: { id: 'banner-7' },
      update: {},
      create: {
        id: 'banner-7',
        imageUrl: 'http://localhost:3000/static/banner3.png',
        title: 'Weekly Deals',
        description: "Check out this week's special deals",
        link: '/deals',
        isActive: true,
      },
    }),
    prisma.promoBanner.upsert({
      where: { id: 'banner-8' },
      update: {},
      create: {
        id: 'banner-8',
        imageUrl: 'http://localhost:3000/static/banner4.jpg',
        title: 'Fresh Daily',
        description: 'Daily fresh deliveries to your door',
        link: '/fresh-daily',
        isActive: true,
      },
    }),
    prisma.promoBanner.upsert({
      where: { id: 'banner-9' },
      update: {},
      create: {
        id: 'banner-9',
        imageUrl: 'http://localhost:3000/static/banner1.jpg',
        title: 'Local Products',
        description: 'Support local farmers and producers',
        link: '/local',
        isActive: true,
      },
    }),
    prisma.promoBanner.upsert({
      where: { id: 'banner-10' },
      update: {},
      create: {
        id: 'banner-10',
        imageUrl: 'http://localhost:3000/static/banner2.png',
        title: 'Organic Selection',
        description: 'Fresh organic products for healthy living',
        link: '/organic',
        isActive: true,
      },
    }),
    prisma.promoBanner.upsert({
      where: { id: 'banner-11' },
      update: {},
      create: {
        id: 'banner-11',
        imageUrl: 'http://localhost:3000/static/banner3.png',
        title: 'Weekly Deals',
        description: "Check out this week's special deals",
        link: '/deals',
        isActive: true,
      },
    }),
    prisma.promoBanner.upsert({
      where: { id: 'banner-12' },
      update: {},
      create: {
        id: 'banner-12',
        imageUrl: 'http://localhost:3000/static/banner4.jpg',
        title: 'Fresh Daily',
        description: 'Daily fresh deliveries to your door',
        link: '/fresh-daily',
        isActive: true,
      },
    }),
  ]);

  console.log('Created promo banners:', promoBanners.length);

  // Create categories
  const categoriesData = [
    {
      name: 'Fruits',
      slug: 'fruits',
      icon: 'fruits',
      deName: 'Obst',
      deSlug: 'obst',
      deDesc: 'Frisches und köstliches Obst',
    },
    {
      name: 'Vegetables',
      slug: 'vegetables',
      icon: 'vegetables',
      deName: 'Gemüse',
      deSlug: 'gemuese',
      deDesc: 'Frisches Gemüse und Grünzeug',
    },
    {
      name: 'Dairy',
      slug: 'dairy',
      icon: 'dairy',
      deName: 'Milchprodukte',
      deSlug: 'milchprodukte',
      deDesc: 'Milch, Käse und Milchprodukte',
    },
    {
      name: 'Cheese',
      slug: 'cheese',
      icon: 'CheeseIcon',
      deName: 'Käse',
      deSlug: 'kaese',
      deDesc: 'Verschiedene Käsesorten',
    },
    {
      name: 'Bakery',
      slug: 'bakery',
      icon: 'bakery',
      deName: 'Bäckerei',
      deSlug: 'baeckerei',
      deDesc: 'Frisches Brot und Backwaren',
    },
    {
      name: 'Beverages',
      slug: 'beverages',
      icon: 'beverages',
      deName: 'Getränke',
      deSlug: 'getraenke',
      deDesc: 'Erfrischende Getränke und Säfte',
    },
    {
      name: 'Seafood',
      slug: 'seafood',
      icon: 'seafood',
      deName: 'Meeresfrüchte',
      deSlug: 'meeresfruechte',
      deDesc: 'Frischer Fisch und Meeresfrüchte',
    },
    {
      name: 'Frozen',
      slug: 'frozen',
      icon: 'frozen',
      deName: 'Tiefkühlkost',
      deSlug: 'tiefkuehlkost',
      deDesc: 'Gefrorene Lebensmittel',
    },
    {
      name: 'Grains',
      slug: 'grains',
      icon: 'grains',
      deName: 'Getreide',
      deSlug: 'getreide',
      deDesc: 'Reis, Hafer und Getreideprodukte',
    },
    {
      name: 'Meat',
      slug: 'meat',
      icon: 'meat',
      deName: 'Fleisch',
      deSlug: 'fleisch',
      deDesc: 'Frisches Fleisch und Fleischprodukte',
    },
    {
      name: 'Sweets',
      slug: 'sweets',
      icon: 'sweets',
      deName: 'Süßigkeiten',
      deSlug: 'suessigkeiten',
      deDesc: 'Leckere Süßigkeiten und Desserts',
    },
    {
      name: 'Canned',
      slug: 'canned',
      icon: 'canned',
      deName: 'Konserven',
      deSlug: 'konserven',
      deDesc: 'Lebensmittel in Dosen',
    },
    {
      name: 'Sauces',
      slug: 'sauces',
      icon: 'sauces',
      deName: 'Soßen',
      deSlug: 'sossen',
      deDesc: 'Verschiedene Soßen und Dressings',
    },
    {
      name: 'Snacks',
      slug: 'snacks',
      icon: 'snacks',
      deName: 'Snacks',
      deSlug: 'snacks',
      deDesc: 'Kleine Zwischenmahlzeiten und Knabbereien',
    },
    {
      name: 'Nuts',
      slug: 'nuts',
      icon: 'nuts',
      deName: 'Nüsse',
      deSlug: 'nuesse',
      deDesc: 'Gesunde Nüsse und Kerne',
    },
    {
      name: 'Spices',
      slug: 'spices',
      icon: 'spices',
      deName: 'Gewürze',
      deSlug: 'gewuerze',
      deDesc: 'Aromatische Gewürze und Kräuter',
    },
    {
      name: 'Household',
      slug: 'household',
      icon: 'household',
      deName: 'Haushalt',
      deSlug: 'haushalt',
      deDesc: 'Produkte für den täglichen Haushalt',
    },
  ];

  const categoryMap = {};

  for (const c of categoriesData) {
    const category = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        name: c.name,
        slug: c.slug,
        description: `${c.name} products`,
        isActive: true,
        icon: c.icon,
      },
    });
    categoryMap[c.slug] = category;

    // Add German translation if available
    if (c.deName) {
      await prisma.categoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: category.id, locale: 'de' } },
        update: {},
        create: {
          categoryId: category.id,
          locale: 'de',
          name: c.deName,
          slug: c.deSlug,
          description: c.deDesc,
        },
      });
    }
  }

  console.log('Created categories with German translations');

  // Create tags
  const tagsData = [
    {
      name: 'Organic',
      slug: 'organic',
      description: 'Organically grown products',
      color: '#4CAF50',
    },
    {
      name: 'Local',
      slug: 'local',
      description: 'Locally sourced products',
      color: '#2196F3',
    },
    {
      name: 'Fresh',
      slug: 'fresh',
      description: 'Fresh and crisp products',
      color: '#FF9800',
    },
    {
      name: 'Premium',
      slug: 'premium',
      description: 'Premium quality products',
      color: '#9C27B0',
    },
    {
      name: 'Seasonal',
      slug: 'seasonal',
      description: 'Seasonal products',
      color: '#F44336',
    },
    {
      name: 'Healthy',
      slug: 'healthy',
      description: 'Healthy and nutritious products',
      color: '#8BC34A',
    },
  ];

  const tagMap = {};

  for (const t of tagsData) {
    const tag = await prisma.tag.upsert({
      where: { slug: t.slug },
      update: {},
      create: { ...t, isActive: true },
    });
    tagMap[t.slug] = tag;

    // German translations
    const deMap = {
      Organic: 'Bio',
      Local: 'Lokal',
      Fresh: 'Frisch',
      Premium: 'Premium',
      Seasonal: 'Saisonal',
      Healthy: 'Gesund',
    };
    const deDesc = {
      Organic: 'Biologisch angebaute Produkte',
      Local: 'Lokal bezogene Produkte',
      Fresh: 'Frische und knusprige Produkte',
      Premium: 'Premium-Qualitätsprodukte',
      Seasonal: 'Saisonale Produkte',
      Healthy: 'Gesunde und nahrhafte Produkte',
    };

    await prisma.tagTranslation.upsert({
      where: { tagId_locale: { tagId: tag.id, locale: 'de' } },
      update: {},
      create: {
        tagId: tag.id,
        locale: 'de',
        name: deMap[t.name],
        description: deDesc[t.name],
      },
    });
  }

  console.log('Created tags with German translations');

  // Create products
  const productsData = [
    {
      name: 'Blueberries',
      slug: 'blueberries',
      shortDescription: 'Fresh and juicy blueberries',
      description: 'Perfect for breakfast or desserts',
      price: 60.0,
      oldPrice: 70.0,
      stock: 90,
      categorySlug: 'fruits',
      tags: ['fresh', 'healthy', 'seasonal'],
      images: [
        {
          url: 'https://pngimg.com/uploads/blueberries/blueberries_PNG4.png',
          alt: 'Blueberries',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Blaubeeren',
        slug: 'blaubeeren',
        shortDescription: 'Frische und saftige Blaubeeren',
        description: 'Perfekt für Frühstück oder Desserts',
      },
    },
    {
      name: 'Raspberries',
      slug: 'raspberries',
      shortDescription: 'Sweet red raspberries',
      description: 'Locally grown and fresh raspberries',
      price: 65.0,
      oldPrice: 75.0,
      stock: 80,
      categorySlug: 'fruits',
      tags: ['fresh', 'organic', 'seasonal'],
      images: [
        {
          url: 'https://pngimg.com/uploads/raspberry/raspberry_PNG5041.png',
          alt: 'Raspberries',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Himbeeren',
        slug: 'himbeeren',
        shortDescription: 'Süße rote Himbeeren',
        description: 'Lokal angebaut und frisch',
      },
    },
    {
      name: 'Cucumbers',
      slug: 'cucumbers',
      shortDescription: 'Fresh green cucumbers',
      description: 'Crisp cucumbers, perfect for salads',
      price: 35.0,
      oldPrice: 40.0,
      stock: 8,
      categorySlug: 'vegetables',
      tags: ['fresh', 'healthy', 'local'],
      images: [
        {
          url: 'https://pngimg.com/uploads/cucumber/cucumber_PNG84317.png',
          alt: 'Fresh cucumbers',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Gurken',
        slug: 'gurken',
        shortDescription: 'Frische grüne Gurken',
        description: 'Knackige Gurken, perfekt für Salate',
      },
    },
    {
      name: 'Tomatoes',
      slug: 'tomatoes',
      shortDescription: 'Juicy red tomatoes',
      description: 'Fresh tomatoes, ideal for cooking and salads',
      price: 40.0,
      oldPrice: 50.0,
      stock: 6,
      categorySlug: 'vegetables',
      tags: ['fresh', 'organic', 'healthy'],
      images: [
        {
          url: 'https://pngimg.com/uploads/tomato/tomato_PNG12541.png',
          alt: 'Red tomatoes',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Tomaten',
        slug: 'tomaten',
        shortDescription: 'Saftige rote Tomaten',
        description: 'Frische Tomaten, ideal zum Kochen und für Salate',
      },
    },
    {
      name: 'Butter',
      slug: 'butter',
      shortDescription: 'Creamy unsalted butter',
      description: 'Fresh unsalted butter, perfect for baking',
      price: 55.0,
      oldPrice: 65.0,
      stock: 1,
      categorySlug: 'dairy',
      tags: ['fresh', 'premium'],
      images: [
        {
          url: 'https://pngimg.com/uploads/butter/butter_PNG12.png',
          alt: 'Unsalted butter',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Butter',
        slug: 'butter',
        shortDescription: 'Cremige ungesalzene Butter',
        description: 'Frische ungesalzene Butter, perfekt zum Backen',
      },
    },
    {
      name: 'Mozzarella Cheese',
      slug: 'mozzarella-cheese',
      shortDescription: 'Soft mozzarella cheese',
      description: 'Creamy mozzarella, ideal for pizzas and salads',
      price: 75.0,
      oldPrice: 85.0,
      stock: 60,
      categorySlug: 'dairy',
      tags: ['premium', 'fresh'],
      images: [
        {
          url: 'https://pngimg.com/uploads/cheese/cheese_PNG25336.png',
          alt: 'Mozzarella cheese',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Mozzarella Käse',
        slug: 'mozzarella-kaese',
        shortDescription: 'Weicher Mozzarella Käse',
        description: 'Cremiger Mozzarella, ideal für Pizza und Salate',
      },
    },
    {
      name: 'Pineapple',
      slug: 'pineapple',
      shortDescription: 'Sweet tropical pineapple',
      description: 'Juicy pineapple, perfect for desserts and smoothies',
      price: 80.0,
      oldPrice: 95.0,
      stock: 50,
      categorySlug: 'fruits',
      tags: ['fresh', 'healthy', 'seasonal'],
      images: [
        {
          url: 'https://pngimg.com/uploads/pineapple/pineapple_PNG2756.png',
          alt: 'Pineapple',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Ananas',
        slug: 'ananas',
        shortDescription: 'Süße tropische Ananas',
        description: 'Saftige Ananas, perfekt für Desserts und Smoothies',
      },
    },
    {
      name: 'Mango',
      slug: 'mango',
      shortDescription: 'Ripe juicy mango',
      description: 'Sweet mango, perfect for smoothies and desserts',
      price: 90.0,
      oldPrice: 100.0,
      stock: 4,
      categorySlug: 'fruits',
      tags: ['fresh', 'premium', 'seasonal'],
      images: [
        {
          url: 'https://pngimg.com/uploads/mango/mango_PNG9164.png',
          alt: 'Ripe mango',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Mango',
        slug: 'mango',
        shortDescription: 'Reife saftige Mango',
        description: 'Süße Mango, perfekt für Smoothies und Desserts',
      },
    },
    {
      name: 'Bell Peppers',
      slug: 'bell-peppers',
      shortDescription: 'Fresh colorful bell peppers',
      description: 'Crisp bell peppers, perfect for cooking and salads',
      price: 45.0,
      oldPrice: 55.0,
      stock: 100,
      categorySlug: 'vegetables',
      tags: ['fresh', 'healthy'],
      images: [
        {
          url: 'https://pngimg.com/uploads/pepper/pepper_PNG3232.png',
          alt: 'Bell peppers',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Paprika',
        slug: 'paprika',
        shortDescription: 'Frische bunte Paprika',
        description: 'Knackige Paprika, perfekt zum Kochen und für Salate',
      },
    },
    {
      name: 'Cottage Cheese',
      slug: 'cottage-cheese',
      shortDescription: 'Soft and creamy cottage cheese',
      description: 'Low-fat cottage cheese, ideal for healthy meals',
      price: 50.0,
      oldPrice: 60.0,
      stock: 1,
      categorySlug: 'dairy',
      tags: ['fresh', 'healthy'],
      images: [
        {
          url: 'https://pngimg.com/uploads/cottage_cheese/cottage_cheese_PNG1.png',
          alt: 'Cottage cheese',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Hüttenkäse',
        slug: 'huettenkaese',
        shortDescription: 'Weicher und cremiger Hüttenkäse',
        description: 'Fettarmer Hüttenkäse, ideal für gesunde Mahlzeiten',
      },
    },
    {
      name: 'Red Apples',
      slug: 'red-apples',
      shortDescription: 'Crisp and sweet red apples',
      description: 'Crisp and sweet red apples, perfect for snacks',
      price: 50.0,
      oldPrice: 60.0,
      stock: 120,
      categorySlug: 'fruits',
      tags: ['fresh', 'healthy'],
      images: [
        {
          url: 'https://pngimg.com/uploads/apple/apple_PNG12489.png',
          alt: 'Red apples',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Rote Äpfel',
        slug: 'rote-aepfel',
        shortDescription: 'Knackige und süße rote Äpfel',
        description: 'Knackige und süße rote Äpfel, perfekt für Snacks',
      },
    },
    {
      name: 'Bananas',
      slug: 'bananas',
      shortDescription: 'Ripe yellow bananas',
      description: 'Sweet and ripe bananas, ideal for smoothies',
      price: 30.0,
      oldPrice: 0,
      stock: 200,
      categorySlug: 'fruits',
      tags: ['fresh', 'healthy', 'local'],
      images: [
        {
          url: 'https://pngimg.com/uploads/banana/banana_PNG845.png',
          alt: 'Ripe bananas',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Bananen',
        slug: 'bananen',
        shortDescription: 'Reife gelbe Bananen',
        description: 'Süße und reife Bananen, ideal für Smoothies',
      },
    },
    {
      name: 'Carrots',
      slug: 'carrots',
      shortDescription: 'Fresh orange carrots',
      description: 'Crunchy and fresh carrots, grown locally',
      price: 25.0,
      oldPrice: 30.0,
      stock: 3,
      categorySlug: 'vegetables',
      tags: ['fresh', 'organic', 'local'],
      images: [
        {
          url: 'https://pngimg.com/uploads/carrot/carrot_PNG4978.png',
          alt: 'Fresh carrots',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Karotten',
        slug: 'karotten',
        shortDescription: 'Frische orange Karotten',
        description: 'Knackige und frische Karotten, lokal angebaut',
      },
    },
    {
      name: 'Broccoli',
      slug: 'broccoli',
      shortDescription: 'Green broccoli florets',
      description: 'Fresh broccoli, great for salads and cooking',
      price: 40.0,
      oldPrice: 50.0,
      stock: 80,
      categorySlug: 'vegetables',
      tags: ['fresh', 'healthy'],
      images: [
        {
          url: 'https://pngimg.com/uploads/broccoli/broccoli_PNG2829.png',
          alt: 'Green broccoli',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Brokkoli',
        slug: 'brokkoli',
        shortDescription: 'Grüne Brokkoli-Röschen',
        description: 'Frischer Brokkoli, ideal für Salate und Kochen',
      },
    },
    {
      name: 'Milk',
      slug: 'milk',
      shortDescription: 'Fresh whole milk',
      description: 'Fresh whole milk from local farms',
      price: 20.0,
      oldPrice: 25.0,
      stock: 7,
      categorySlug: 'dairy',
      tags: ['fresh', 'local', 'healthy'],
      images: [
        {
          url: 'https://pngimg.com/uploads/milk/milk_PNG12733.png',
          alt: 'Fresh milk',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Milch',
        slug: 'milch',
        shortDescription: 'Frische Vollmilch',
        description: 'Frische Vollmilch von lokalen Bauernhöfen',
      },
    },
    {
      name: 'Cheddar Cheese',
      slug: 'cheddar-cheese',
      shortDescription: 'Aged cheddar cheese',
      description: 'Rich and flavorful aged cheddar cheese',
      price: 70.0,
      oldPrice: 90.0,
      stock: 60,
      categorySlug: 'dairy',
      tags: ['premium', 'healthy'],
      images: [
        {
          url: 'https://pngimg.com/uploads/cheese/cheese_PNG25321.png',
          alt: 'Cheddar cheese',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Cheddar Käse',
        slug: 'cheddar-kaese',
        shortDescription: 'Gereifter Cheddar Käse',
        description: 'Reicher und aromatischer gereifter Cheddar Käse',
      },
    },
    {
      name: 'Almonds',
      slug: 'almonds',
      shortDescription: 'Crunchy almonds',
      description: 'Fresh and crunchy almonds, perfect for snacks',
      price: 90.0,
      oldPrice: 110.0,
      stock: 70,
      categorySlug: 'nuts',
      tags: ['organic', 'healthy', 'premium'],
      images: [
        {
          url: 'https://pngimg.com/uploads/almond/almond_PNG62.png',
          alt: 'Crunchy almonds',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Mandeln',
        slug: 'mandeln',
        shortDescription: 'Knackige Mandeln',
        description: 'Frische und knackige Mandeln, perfekt für Snacks',
      },
    },
    {
      name: 'Spinach',
      slug: 'spinach',
      shortDescription: 'Fresh green spinach',
      description: 'Leafy green spinach, rich in nutrients',
      price: 35.0,
      oldPrice: 45.0,
      stock: 90,
      categorySlug: 'vegetables',
      tags: ['fresh', 'healthy', 'organic'],
      images: [
        {
          url: 'https://pngimg.com/uploads/spinach/spinach_PNG12.png',
          alt: 'Fresh spinach',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Spinat',
        slug: 'spinat',
        shortDescription: 'Frischer grüner Spinat',
        description: 'Blattspinat, reich an Nährstoffen',
      },
    },
    {
      name: 'Orange Juice',
      slug: 'orange-juice',
      shortDescription: 'Freshly squeezed orange juice',
      description: '100% natural orange juice with no added sugar',
      price: 55.0,
      oldPrice: 65.0,
      stock: 50,
      categorySlug: 'beverages',
      tags: ['fresh', 'healthy', 'local'],
      images: [
        {
          url: 'https://pngimg.com/uploads/juice/juice_PNG7156.png',
          alt: 'Orange juice',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Orangensaft',
        slug: 'orangensaft',
        shortDescription: 'Frisch gepresster Orangensaft',
        description: '100% natürlicher Orangensaft ohne Zuckerzusatz',
      },
    },
    {
      name: 'Greek Yogurt',
      slug: 'greek-yogurt',
      shortDescription: 'Creamy Greek yogurt',
      description: 'Thick and creamy Greek yogurt, rich in protein',
      price: 45.0,
      oldPrice: 55.0,
      stock: 80,
      categorySlug: 'dairy',
      tags: ['fresh', 'healthy', 'premium'],
      images: [
        {
          url: 'https://pngimg.com/uploads/yogurt/yogurt_PNG15190.png',
          alt: 'Greek yogurt',
          isMain: true,
          order: 1,
        },
      ],
      translation: {
        locale: 'de',
        name: 'Griechischer Joghurt',
        slug: 'griechischer-joghurt',
        shortDescription: 'Cremiger griechischer Joghurt',
        description: 'Dicker und cremiger griechischer Joghurt, proteinreich',
      },
    },
  ];

  // Create products with proper category references and tag connections
  for (const p of productsData) {
    const product = await prisma.product.create({
      data: {
        name: p.name,
        slug: p.slug,
        shortDescription: p.shortDescription,
        description: p.description,
        price: p.price,
        oldPrice: p.oldPrice || null,
        stock: p.stock,
        categories: {
          connect: [{ id: categoryMap[p.categorySlug]?.id }],
        },
        tags: {
          connect: p.tags
            .map((tagSlug) => ({ id: tagMap[tagSlug]?.id }))
            .filter((tag) => tag.id),
        },
        images: {
          create: p.images,
        },
      },
    });

    // Create German translation
    await prisma.productTranslation.create({
      data: {
        productId: product.id,
        locale: p.translation.locale,
        name: p.translation.name,
        slug: p.translation.slug,
        shortDescription: p.translation.shortDescription,
        description: p.translation.description,
      },
    });
  }

  console.log('Created products with German translations');
  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
