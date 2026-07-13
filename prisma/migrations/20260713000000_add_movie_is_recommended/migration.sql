-- AlterTable
ALTER TABLE "Movie" ADD COLUMN "isRecommended" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Movie_isRecommended_idx" ON "Movie"("isRecommended");
