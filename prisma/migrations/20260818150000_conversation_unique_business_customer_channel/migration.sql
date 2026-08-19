-- AlterTable: Add unique constraint on Conversation(businessId, customerId, channel)
-- First remove duplicate conversations, keeping the oldest one per (businessId, customerId, channel).
DELETE FROM "Conversation" c1
USING "Conversation" c2
WHERE c1."id" > c2."id"
  AND c1."businessId" = c2."businessId"
  AND c1."customerId" = c2."customerId"
  AND (c1."channel" = c2."channel" OR (c1."channel" IS NULL AND c2."channel" IS NULL));

-- CreateIndex: Unique constraint
CREATE UNIQUE INDEX "Conversation_businessId_customerId_channel_key" ON "Conversation"("businessId", "customerId", "channel");
