export type SlugTranslation = {
  locale: string;
  slug: string;
};

export function normalizeLocale(locale?: string): string {
  const normalized = (locale || 'en').trim().toLowerCase();
  return normalized.split('-')[0] || 'en';
}

export function buildSlugMap(
  fallbackSlug?: string,
  translations?: SlugTranslation[],
) {
  const enSlug = translations?.find((translation) => translation.locale === 'en')?.slug;
  const deSlug = translations?.find((translation) => translation.locale === 'de')?.slug;

  return {
    en: enSlug ?? fallbackSlug ?? '',
    de: deSlug ?? fallbackSlug ?? '',
  };
}
