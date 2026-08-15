import { prisma } from '../src/lib/prisma';
import { MembershipRole } from '@prisma/client';
import { createProduct } from '../src/features/products/product.service';
import {
  setStock,
  checkAvailability,
  reserve,
  commit,
  release,
  restoreAfterRefund,
  manualAdjustment,
} from '../src/features/products/inventory.service';
import { createUserInBusiness, resetDatabase } from './helpers';

describe('Inventory', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function makeVariant(email: string, sku: string) {
    const { user, business } = await createUserInBusiness(email);
    const product = await createProduct(user.id, business.id, {
      name: `Inventory item ${sku}`,
      description: 'd',
      price: 1000,
      variant: { sku },
    });
    return { user, business, product, variant: product.variants[0] };
  }

  it('creates an inventory record for every variant with available 0 and reserved 0', async () => {
    const { user, business, product } = await makeVariant(
      'inv-auto@example.com',
      'INV-AUTO',
    );
    const second = await createProduct(user.id, business.id, {
      name: 'Second item',
      description: 'd',
      price: 500,
      variant: { sku: 'INV-AUTO2' },
    });

    const variants = await prisma.productVariant.findMany({
      where: {
        productId: { in: [product.id, second.id] },
        businessId: business.id,
      },
      include: { inventory: true },
    });
    expect(variants).toHaveLength(2);
    for (const v of variants) {
      expect(v.inventory).not.toBeNull();
      expect(v.inventory?.available).toBe(0);
      expect(v.inventory?.reserved).toBe(0);
    }
  });

  it('sets stock for a variant and records the movement', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-set@example.com',
      'INV-SET',
    );
    const result = await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 10,
      location: 'Abuja',
    });

    expect(result.applied).toBe(true);
    expect(result.inventory).toMatchObject({
      available: 10,
      reserved: 0,
      location: 'Abuja',
    });

    const row = await prisma.inventory.findUniqueOrThrow({
      where: { productVariantId: variant.id },
    });
    expect(row.available).toBe(10);

    const movement = await prisma.inventoryMovement.findMany({
      where: { inventoryId: row.id },
    });
    expect(movement).toHaveLength(1);
    expect(movement[0]).toMatchObject({
      reason: 'import',
      quantityDelta: 10,
      sourceId: variant.id,
      businessId: business.id,
    });
  });

  it('reports availability from authoritative inventory state', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-avail@example.com',
      'INV-AV',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 5,
    });

    const enough = await checkAvailability(user.id, business.id, {
      variantId: variant.id,
      quantity: 3,
    });
    expect(enough.quantityAvailable).toBe(true);
    expect(enough.outOfStock).toBe(false);
    expect(enough.available).toBe(5);

    const notEnough = await checkAvailability(user.id, business.id, {
      variantId: variant.id,
      quantity: 6,
    });
    expect(notEnough.quantityAvailable).toBe(false);

    const zeroVariant = await makeVariant('inv-avail0@example.com', 'INV-AVZ');
    await setStock(zeroVariant.user.id, zeroVariant.business.id, {
      variantId: zeroVariant.variant.id,
      available: 0,
    });
    const zero = await checkAvailability(
      zeroVariant.user.id,
      zeroVariant.business.id,
      {
        variantId: zeroVariant.variant.id,
        quantity: 1,
      },
    );
    expect(zero.outOfStock).toBe(true);
    expect(zero.quantityAvailable).toBe(false);
  });

  it('reserves stock conditionally (available down, reserved up)', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-res@example.com',
      'INV-RES',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 5,
    });

    const result = await reserve(user.id, business.id, {
      variantId: variant.id,
      quantity: 2,
      orderId: 'order-res-1',
    });

    expect(result.applied).toBe(true);
    expect(result.inventory).toMatchObject({ available: 3, reserved: 2 });

    const movement = await prisma.inventoryMovement.findMany({
      where: { reason: 'reservation', sourceId: 'order-res-1' },
    });
    expect(movement).toHaveLength(1);
    expect(movement[0].quantityDelta).toBe(-2);
  });

  it('rejects a reservation that exceeds available stock', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-short@example.com',
      'INV-SHORT',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 1,
    });

    await expect(
      reserve(user.id, business.id, {
        variantId: variant.id,
        quantity: 2,
        orderId: 'order-short-1',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    const row = await prisma.inventory.findUniqueOrThrow({
      where: { productVariantId: variant.id },
    });
    expect(row.available).toBe(1);
    expect(row.reserved).toBe(0);
  });

  it('prevents overselling under concurrent reservations', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-conc@example.com',
      'INV-CONC',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 1,
    });

    const results = await Promise.allSettled([
      reserve(user.id, business.id, {
        variantId: variant.id,
        quantity: 1,
        orderId: 'order-conc-a',
      }),
      reserve(user.id, business.id, {
        variantId: variant.id,
        quantity: 1,
        orderId: 'order-conc-b',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
    });

    const row = await prisma.inventory.findUniqueOrThrow({
      where: { productVariantId: variant.id },
    });
    expect(row.available).toBe(0);
    expect(row.reserved).toBe(1);
  });

  it('is idempotent: a repeated reservation for the same order does not double-reserve', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-idem@example.com',
      'INV-IDEM',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 5,
    });

    const first = await reserve(user.id, business.id, {
      variantId: variant.id,
      quantity: 2,
      orderId: 'order-idem-1',
    });
    expect(first.applied).toBe(true);

    const second = await reserve(user.id, business.id, {
      variantId: variant.id,
      quantity: 2,
      orderId: 'order-idem-1',
    });
    expect(second.applied).toBe(false);
    expect(second.alreadyApplied).toBe(true);
    expect(second.inventory).toMatchObject({ available: 3, reserved: 2 });

    const movements = await prisma.inventoryMovement.findMany({
      where: { reason: 'reservation', sourceId: 'order-idem-1' },
    });
    expect(movements).toHaveLength(1);
  });

  it('is idempotent under concurrent duplicate reservations for the same order', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-idem-conc@example.com',
      'INV-IDEMC',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 5,
    });

    const results = await Promise.allSettled([
      reserve(user.id, business.id, {
        variantId: variant.id,
        quantity: 2,
        orderId: 'order-idemc-1',
      }),
      reserve(user.id, business.id, {
        variantId: variant.id,
        quantity: 2,
        orderId: 'order-idemc-1',
      }),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(0);

    const row = await prisma.inventory.findUniqueOrThrow({
      where: { productVariantId: variant.id },
    });
    expect(row.available).toBe(3);
    expect(row.reserved).toBe(2);

    const movements = await prisma.inventoryMovement.findMany({
      where: { reason: 'reservation', sourceId: 'order-idemc-1' },
    });
    expect(movements).toHaveLength(1);
  });

  it('releases reserved stock back to available', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-rel@example.com',
      'INV-REL',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 4,
    });
    await reserve(user.id, business.id, {
      variantId: variant.id,
      quantity: 3,
      orderId: 'order-rel-1',
    });

    const result = await release(user.id, business.id, {
      variantId: variant.id,
      quantity: 3,
      orderId: 'order-rel-1',
    });
    expect(result.applied).toBe(true);
    expect(result.inventory).toMatchObject({ available: 4, reserved: 0 });

    const movement = await prisma.inventoryMovement.findMany({
      where: { reason: 'release', sourceId: 'order-rel-1' },
    });
    expect(movement[0].quantityDelta).toBe(3);
  });

  it('release is idempotent', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-rel-idem@example.com',
      'INV-RELID',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 2,
    });
    await reserve(user.id, business.id, {
      variantId: variant.id,
      quantity: 2,
      orderId: 'order-relid-1',
    });

    const first = await release(user.id, business.id, {
      variantId: variant.id,
      quantity: 2,
      orderId: 'order-relid-1',
    });
    expect(first.applied).toBe(true);

    const second = await release(user.id, business.id, {
      variantId: variant.id,
      quantity: 2,
      orderId: 'order-relid-1',
    });
    expect(second.alreadyApplied).toBe(true);
    expect(second.inventory).toMatchObject({ available: 2, reserved: 0 });

    const movements = await prisma.inventoryMovement.findMany({
      where: { reason: 'release', sourceId: 'order-relid-1' },
    });
    expect(movements).toHaveLength(1);
  });

  it('rejects releasing more stock than is reserved', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-rel-short@example.com',
      'INV-RELSH',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 3,
    });

    await expect(
      release(user.id, business.id, {
        variantId: variant.id,
        quantity: 1,
        orderId: 'order-relsh-1',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('commits reserved stock (reserved down, available unchanged)', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-commit@example.com',
      'INV-COM',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 10,
    });
    await reserve(user.id, business.id, {
      variantId: variant.id,
      quantity: 4,
      orderId: 'order-com-1',
    });

    const result = await commit(user.id, business.id, {
      variantId: variant.id,
      quantity: 4,
      orderId: 'order-com-1',
    });
    expect(result.applied).toBe(true);
    expect(result.inventory).toMatchObject({ available: 6, reserved: 0 });

    const movement = await prisma.inventoryMovement.findMany({
      where: { reason: 'commitment', sourceId: 'order-com-1' },
    });
    expect(movement[0].quantityDelta).toBe(-4);
  });

  it('rejects committing more stock than is reserved', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-com-short@example.com',
      'INV-COMSH',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 5,
    });

    await expect(
      commit(user.id, business.id, {
        variantId: variant.id,
        quantity: 1,
        orderId: 'order-comsh-1',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('restores stock to available after a confirmed refund', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-refund@example.com',
      'INV-REF',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 8,
    });
    await reserve(user.id, business.id, {
      variantId: variant.id,
      quantity: 3,
      orderId: 'order-ref-1',
    });
    await commit(user.id, business.id, {
      variantId: variant.id,
      quantity: 3,
      orderId: 'order-ref-1',
    });

    const result = await restoreAfterRefund(user.id, business.id, {
      variantId: variant.id,
      quantity: 3,
      orderId: 'order-ref-1',
    });
    expect(result.applied).toBe(true);
    expect(result.inventory).toMatchObject({ available: 8, reserved: 0 });

    const movement = await prisma.inventoryMovement.findMany({
      where: { reason: 'return/refund', sourceId: 'order-ref-1' },
    });
    expect(movement[0].quantityDelta).toBe(3);
  });

  it('applies manual adjustments and rejects reductions below zero', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-adjust@example.com',
      'INV-ADJ',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 5,
    });

    const up = await manualAdjustment(user.id, business.id, {
      variantId: variant.id,
      delta: 3,
    });
    expect(up.applied).toBe(true);
    expect(up.inventory.available).toBe(8);

    const down = await manualAdjustment(user.id, business.id, {
      variantId: variant.id,
      delta: -2,
    });
    expect(down.applied).toBe(true);
    expect(down.inventory.available).toBe(6);

    await expect(
      manualAdjustment(user.id, business.id, {
        variantId: variant.id,
        delta: -10,
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    const row = await prisma.inventory.findUniqueOrThrow({
      where: { productVariantId: variant.id },
    });
    expect(row.available).toBe(6);

    const movements = await prisma.inventoryMovement.findMany({
      where: { inventoryId: row.id, reason: 'manual_adjustment' },
    });
    expect(movements).toHaveLength(2);
    expect(movements.map((m) => m.quantityDelta).sort((a, b) => a - b)).toEqual(
      [-2, 3],
    );
  });

  it('never lets inventory quantities go negative', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-neg@example.com',
      'INV-NEG',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 2,
    });

    await expect(
      manualAdjustment(user.id, business.id, {
        variantId: variant.id,
        delta: -3,
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    await expect(
      reserve(user.id, business.id, {
        variantId: variant.id,
        quantity: 3,
        orderId: 'order-neg-1',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    const row = await prisma.inventory.findUniqueOrThrow({
      where: { productVariantId: variant.id },
    });
    expect(row.available).toBeGreaterThanOrEqual(0);
    expect(row.reserved).toBeGreaterThanOrEqual(0);
  });

  it('records an auditable InventoryMovement for every change', async () => {
    const { user, business, variant } = await makeVariant(
      'inv-audit@example.com',
      'INV-AUD',
    );
    await setStock(user.id, business.id, {
      variantId: variant.id,
      available: 10,
    });
    await reserve(user.id, business.id, {
      variantId: variant.id,
      quantity: 2,
      orderId: 'order-aud-1',
    });
    await commit(user.id, business.id, {
      variantId: variant.id,
      quantity: 1,
      orderId: 'order-aud-1',
    });
    await release(user.id, business.id, {
      variantId: variant.id,
      quantity: 1,
      orderId: 'order-aud-1',
    });
    await manualAdjustment(user.id, business.id, {
      variantId: variant.id,
      delta: 4,
      idempotencyKey: 'adjust-aud-1',
    });

    const row = await prisma.inventory.findUniqueOrThrow({
      where: { productVariantId: variant.id },
    });
    const movements = await prisma.inventoryMovement.findMany({
      where: { inventoryId: row.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements).toHaveLength(5);
    expect(movements.map((m) => m.reason)).toEqual([
      'import',
      'reservation',
      'commitment',
      'release',
      'manual_adjustment',
    ]);
    for (const m of movements) {
      expect(m.businessId).toBe(business.id);
      expect(m.inventoryId).toBe(row.id);
      expect(m.sourceId).toBeTruthy();
      expect(m.createdAt).toBeInstanceOf(Date);
    }
  });

  it('denies cross-business inventory access identically to not-found', async () => {
    const a = await createUserInBusiness('inv-iso-a@example.com');
    const b = await createUserInBusiness('inv-iso-b@example.com');
    const product = await createProduct(a.user.id, a.business.id, {
      name: 'A stock item',
      description: 'd',
      price: 500,
      variant: { sku: 'INV-ISO-A' },
    });
    const variant = product.variants[0];
    await setStock(a.user.id, a.business.id, {
      variantId: variant.id,
      available: 4,
    });

    await expect(
      checkAvailability(b.user.id, b.business.id, {
        variantId: variant.id,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT' });
    await expect(
      setStock(b.user.id, b.business.id, {
        variantId: variant.id,
        available: 9,
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT' });
    await expect(
      reserve(b.user.id, b.business.id, {
        variantId: variant.id,
        quantity: 1,
        orderId: 'order-iso-b',
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT' });

    const missing = await checkAvailability(a.user.id, a.business.id, {
      variantId: 'does-not-exist',
      quantity: 1,
    }).catch((e) => e);
    expect(missing.code).toBe('UNKNOWN_PRODUCT');
  });

  it('denies inventory access to roles without the products_inventory scope', async () => {
    const { user, business } = await createUserInBusiness(
      'inv-scope@example.com',
      MembershipRole.SUPPORT_AGENT,
    );
    await expect(
      checkAvailability(user.id, business.id, {
        variantId: 'anything',
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      setStock(user.id, business.id, { variantId: 'anything', available: 1 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
