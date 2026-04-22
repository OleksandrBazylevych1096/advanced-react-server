ALTER TABLE "tag_translations"
ADD COLUMN "slug" TEXT;

UPDATE "tag_translations" AS tt
SET "slug" = t."slug"
FROM "tags" AS t
WHERE tt."tagId" = t."id";

UPDATE "tag_translations" AS tt
SET "slug" = CASE t."slug"
  WHEN 'organic' THEN 'bio'
  WHEN 'local' THEN 'lokal'
  WHEN 'fresh' THEN 'frisch'
  WHEN 'premium' THEN 'premium'
  WHEN 'seasonal' THEN 'saisonal'
  WHEN 'healthy' THEN 'gesund'
  ELSE tt."slug"
END
FROM "tags" AS t
WHERE tt."tagId" = t."id"
  AND tt."locale" = 'de';

ALTER TABLE "tag_translations"
ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "tag_translations_locale_slug_key" ON "tag_translations"("locale", "slug");
