-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_inventoryId_reason_sourceId_key" ON "InventoryMovement"("inventoryId", "reason", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_businessId_sku_key" ON "ProductVariant"("businessId", "sku");
