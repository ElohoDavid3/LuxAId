-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "CustomerConsentStatus" AS ENUM ('OPTED_IN', 'OPTED_OUT', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "channel" TEXT,
ADD COLUMN     "lastInboundAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "consentStatus" "CustomerConsentStatus" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "direction" "MessageDirection" NOT NULL DEFAULT 'OUTBOUND',
ADD COLUMN     "status" "MessageDeliveryStatus" NOT NULL DEFAULT 'SENT';

-- CreateIndex
CREATE INDEX "Conversation_businessId_channel_idx" ON "Conversation"("businessId", "channel");
