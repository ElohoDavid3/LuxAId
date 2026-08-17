-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('NEW', 'ACTIVE', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageAuthorType" AS ENUM ('CUSTOMER', 'AI', 'HUMAN', 'SYSTEM');

-- DropIndex
DROP INDEX "CustomerChannelIdentity_channel_channelId_key";

-- AlterTable: Conversation.status String -> ConversationStatus, default NEW.
-- Defensive: if any legacy 'OPEN' rows exist they are mapped to NEW before the
-- enum conversion. No other legacy values are valid conversation states.
ALTER TABLE "Conversation" ALTER COLUMN "status" DROP DEFAULT;
UPDATE "Conversation" SET "status" = 'NEW' WHERE "status" = 'OPEN';
ALTER TABLE "Conversation" ALTER COLUMN "status" TYPE "ConversationStatus" USING ("status"::"ConversationStatus");
ALTER TABLE "Conversation" ALTER COLUMN "status" SET DEFAULT 'NEW';

-- AlterTable: Message gains channel + providerMessageId and authorType becomes
-- MessageAuthorType. Tables currently have zero rows; the column conversions
-- are written to fail safely rather than silently coerce unknown values.
ALTER TABLE "Message" ADD COLUMN "channel" TEXT NOT NULL,
ADD COLUMN "providerMessageId" TEXT,
ALTER COLUMN "authorType" TYPE "MessageAuthorType" USING ("authorType"::"MessageAuthorType");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerChannelIdentity_businessId_channel_channelId_key" ON "CustomerChannelIdentity"("businessId", "channel", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_businessId_channel_providerMessageId_key" ON "Message"("businessId", "channel", "providerMessageId");

-- CreateIndex (manual partial unique index: one active escalation per
-- conversation. Prisma 6 PSL cannot express partial indexes; the schema engine
-- does not track predicates, so this stays drift-free.)
CREATE UNIQUE INDEX "Escalation_one_active_per_conversation_key" ON "Escalation"("conversationId") WHERE "status" IN ('OPEN', 'ASSIGNED');
