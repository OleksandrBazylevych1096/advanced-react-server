import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const countries = [
  {
    code: 'UA',
    name: 'Ukraine',
    translations: [
      { locale: 'en', name: 'Ukraine' },
      { locale: 'de', name: 'Ukraine' },
    ],
  },
  {
    code: 'USA',
    name: 'United States',
    translations: [
      { locale: 'en', name: 'United States' },
      { locale: 'de', name: 'Vereinigte Staaten' },
    ],
  },
  {
    code: 'CN',
    name: 'China',
    translations: [
      { locale: 'en', name: 'China' },
      { locale: 'de', name: 'China' },
    ],
  },
  {
    code: 'DE',
    name: 'Germany',
    translations: [
      { locale: 'en', name: 'Germany' },
      { locale: 'de', name: 'Deutschland' },
    ],
  },
  {
    code: 'JP',
    name: 'Japan',
    translations: [
      { locale: 'en', name: 'Japan' },
      { locale: 'de', name: 'Japan' },
    ],
  },
  {
    code: 'KR',
    name: 'South Korea',
    translations: [
      { locale: 'en', name: 'South Korea' },
      { locale: 'de', name: 'Südkorea' },
    ],
  },
  {
    code: 'FR',
    name: 'France',
    translations: [
      { locale: 'en', name: 'France' },
      { locale: 'de', name: 'Frankreich' },
    ],
  },
  {
    code: 'IT',
    name: 'Italy',
    translations: [
      { locale: 'en', name: 'Italy' },
      { locale: 'de', name: 'Italien' },
    ],
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    translations: [
      { locale: 'en', name: 'United Kingdom' },
      { locale: 'de', name: 'Vereinigtes Königreich' },
    ],
  },
  {
    code: 'PL',
    name: 'Poland',
    translations: [
      { locale: 'en', name: 'Poland' },
      { locale: 'de', name: 'Polen' },
    ],
  },
];

async function seedCountries() {
  console.log('Seeding countries...');

  for (const country of countries) {
    const { translations, ...countryData } = country;

    const existingCountry = await prisma.country.findUnique({
      where: { code: countryData.code },
    });

    if (existingCountry) {
      console.log(`Country ${countryData.code} already exists, skipping...`);
      continue;
    }

    await prisma.country.create({
      data: {
        ...countryData,
        translations: {
          create: translations,
        },
      },
    });

  }

  console.log('Countries seeded successfully!');
}

async function main() {
  try {
    await seedCountries();
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
