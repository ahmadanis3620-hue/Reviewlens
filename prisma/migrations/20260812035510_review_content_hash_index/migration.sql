-- DropIndex
DROP INDEX "reviews_businessId_contentHash_key";

-- CreateIndex
CREATE INDEX "reviews_businessId_contentHash_idx" ON "reviews"("businessId", "contentHash");
