CREATE TABLE "search_history" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "queryNormalized" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "search_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "search_history_userId_queryNormalized_key"
ON "search_history"("userId", "queryNormalized");

CREATE INDEX "search_history_userId_updatedAt_idx"
ON "search_history"("userId", "updatedAt");

CREATE INDEX "search_history_updatedAt_idx"
ON "search_history"("updatedAt");

CREATE INDEX "search_history_queryNormalized_idx"
ON "search_history"("queryNormalized");

ALTER TABLE "search_history"
ADD CONSTRAINT "search_history_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
