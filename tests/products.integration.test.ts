import { prisma } from '../src/lib/prisma';
import { ProductStatus, MembershipRole } from '@prisma/client';
import {
  createProduct,
  getProduct,
  listProducts,
  updateProduct,
  changeProductStatus,
} from '../src/features/products/product.service';
import {
  createVariant,
  getVariant,
  updateVariant,
  listVariants,
} from '../src/features/products/variant.service';
import { createUserInBusiness, resetDatabase } from './helpers';

describe('Products', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a product with a default variant and inventory (available 0, reserved 0)', async () => {
    const { user, business } = await createUserInBusiness(
      'product-create@example.com',
    );

    const product = await createProduct(user.id, business.id, {
      name: 'Ankara Gown',
      description: 'Elegant ankara gown',
      price: 25000,
      variant: {
        sku: 'AG-001',
        name: 'Ankara Gown',
        attributes: { color: 'red' },
      },
    });

    expect(product.name).toBe('Ankara Gown');
    expect(product.price).toBe(25000);
    expect(product.status).toBe(ProductStatus.DRAFT);
    expect(product.businessId).toBe(business.id);
    expect(product.variants).toHaveLength(1);
    const variant = product.variants[0];
    expect(variant.sku).toBe('AG-001');
    expect(variant.attributes).toEqual({ color: 'red' });
    expect(variant.inventory?.available).toBe(0);
    expect(variant.inventory?.reserved).toBe(0);
  });

  it('auto-generates a unique SKU when none is provided', async () => {
    const { user, business } = await createUserInBusiness(
      'product-auto-sku@example.com',
    );

    const first = await createProduct(user.id, business.id, {
      name: 'Ankara Gown',
      description: 'Elegant ankara gown',
      price: 25000,
    });
    const second = await createProduct(user.id, business.id, {
      name: 'Ankara Gown',
      description: 'Another gown',
      price: 30000,
      variant: {},
    });

    expect(first.variants).toHaveLength(1);
    expect(first.variants[0].sku).toMatch(/^ANK-[A-Z0-9]{6}$/);
    expect(second.variants[0].sku).toMatch(/^ANK-[A-Z0-9]{6}$/);
    expect(second.variants[0].sku).not.toBe(first.variants[0].sku);

    const rows = await prisma.productVariant.findMany({
      where: { businessId: business.id },
      select: { sku: true },
    });
    expect(new Set(rows.map((r) => r.sku)).size).toBe(2);
  });

  it('stores product, variant, and inventory under the owning Business', async () => {
    const { user, business } = await createUserInBusiness(
      'product-owner@example.com',
    );
    const product = await createProduct(user.id, business.id, {
      name: 'Aso Oke',
      description: 'Handwoven fabric',
      price: 80000,
      variant: { sku: 'AO-100' },
    });

    const row = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      include: { variants: { include: { inventory: true } } },
    });
    expect(row.businessId).toBe(business.id);
    expect(row.variants).toHaveLength(1);
    expect(row.variants[0].businessId).toBe(business.id);
    expect(row.variants[0].inventory?.businessId).toBe(business.id);
  });

  it('retrieves a product by id', async () => {
    const { user, business } = await createUserInBusiness(
      'product-get@example.com',
    );
    const product = await createProduct(user.id, business.id, {
      name: 'Leather Sandals',
      description: 'Handmade leather sandals',
      price: 15000,
      variant: { sku: 'LS-200' },
    });

    const found = await getProduct(user.id, business.id, product.id);
    expect(found.id).toBe(product.id);
    expect(found.name).toBe('Leather Sandals');
  });

  it('updates a product', async () => {
    const { user, business } = await createUserInBusiness(
      'product-update@example.com',
    );
    const product = await createProduct(user.id, business.id, {
      name: 'Beaded Necklace',
      description: 'Handmade beads',
      price: 4000,
      variant: { sku: 'BN-300' },
    });

    const updated = await updateProduct(user.id, business.id, product.id, {
      name: 'Beaded Necklace Deluxe',
      price: 4500,
    });
    expect(updated.name).toBe('Beaded Necklace Deluxe');
    expect(updated.price).toBe(4500);

    const row = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(row.name).toBe('Beaded Necklace Deluxe');
    expect(row.price).toBe(4500);
  });

  it('sets and clears a product photo via imageUrl', async () => {
    const { user, business } = await createUserInBusiness(
      'product-photo@example.com',
    );
    const product = await createProduct(user.id, business.id, {
      name: 'Ankara Gown',
      description: 'Six-piece Ankara gown',
      price: 12000,
      variant: { sku: 'AG-PHOTO' },
    });
    expect(product.imageUrl).toBeNull();

    const withPhoto = await updateProduct(user.id, business.id, product.id, {
      imageUrl: 'https://cdn.example.com/ankara-gown.jpg',
    });
    expect(withPhoto.imageUrl).toBe('https://cdn.example.com/ankara-gown.jpg');

    const withoutPhoto = await updateProduct(user.id, business.id, product.id, {
      imageUrl: null,
    });
    expect(withoutPhoto.imageUrl).toBeNull();
  });

  it('lists only the products of the requesting business', async () => {
    const a = await createUserInBusiness('product-list-a@example.com');
    const b = await createUserInBusiness('product-list-b@example.com');

    await createProduct(a.user.id, a.business.id, {
      name: 'A product 1',
      description: 'd',
      price: 100,
      variant: { sku: 'PA-1' },
    });
    await createProduct(a.user.id, a.business.id, {
      name: 'A product 2',
      description: 'd',
      price: 200,
      variant: { sku: 'PA-2' },
    });
    await createProduct(b.user.id, b.business.id, {
      name: 'B product',
      description: 'd',
      price: 300,
      variant: { sku: 'PB-1' },
    });

    const result = await listProducts(a.user.id, a.business.id);
    expect(result.total).toBe(2);
    expect(result.items.every((p) => p.businessId === a.business.id)).toBe(
      true,
    );
    expect(result.items.map((p) => p.name).sort()).toEqual([
      'A product 1',
      'A product 2',
    ]);
  });

  it('filters the product list by status', async () => {
    const { user, business } = await createUserInBusiness(
      'product-filter@example.com',
    );
    const draft = await createProduct(user.id, business.id, {
      name: 'Draft item',
      description: 'd',
      price: 100,
      variant: { sku: 'FILT-1' },
    });
    const active = await createProduct(user.id, business.id, {
      name: 'Active item',
      description: 'd',
      price: 200,
      variant: { sku: 'FILT-2' },
    });
    await changeProductStatus(
      user.id,
      business.id,
      active.id,
      ProductStatus.ACTIVE,
    );

    const all = await listProducts(user.id, business.id);
    expect(all.total).toBe(2);

    const activeOnly = await listProducts(user.id, business.id, {
      status: ProductStatus.ACTIVE,
    });
    expect(activeOnly.total).toBe(1);
    expect(activeOnly.items[0].id).toBe(active.id);

    const draftOnly = await listProducts(user.id, business.id, {
      status: ProductStatus.DRAFT,
    });
    expect(draftOnly.items[0].id).toBe(draft.id);
  });

  it('allows the documented status transitions', async () => {
    const { user, business } = await createUserInBusiness(
      'product-status-ok@example.com',
    );
    const product = await createProduct(user.id, business.id, {
      name: 'Status OK',
      description: 'd',
      price: 100,
      variant: { sku: 'ST-OK' },
    });

    const active = await changeProductStatus(
      user.id,
      business.id,
      product.id,
      ProductStatus.ACTIVE,
    );
    expect(active.status).toBe(ProductStatus.ACTIVE);

    const archived = await changeProductStatus(
      user.id,
      business.id,
      product.id,
      ProductStatus.ARCHIVED,
    );
    expect(archived.status).toBe(ProductStatus.ARCHIVED);

    const draftArchived = await createProduct(user.id, business.id, {
      name: 'Status OK 2',
      description: 'd',
      price: 100,
      variant: { sku: 'ST-OK2' },
    });
    const arch = await changeProductStatus(
      user.id,
      business.id,
      draftArchived.id,
      ProductStatus.ARCHIVED,
    );
    expect(arch.status).toBe(ProductStatus.ARCHIVED);
  });

  it('rejects invalid status transitions (no reactivation, no going back)', async () => {
    const { user, business } = await createUserInBusiness(
      'product-status-bad@example.com',
    );
    const product = await createProduct(user.id, business.id, {
      name: 'Status Bad',
      description: 'd',
      price: 100,
      variant: { sku: 'ST-BAD' },
    });

    await changeProductStatus(
      user.id,
      business.id,
      product.id,
      ProductStatus.ACTIVE,
    );

    await expect(
      changeProductStatus(
        user.id,
        business.id,
        product.id,
        ProductStatus.DRAFT,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await changeProductStatus(
      user.id,
      business.id,
      product.id,
      ProductStatus.ARCHIVED,
    );
    await expect(
      changeProductStatus(
        user.id,
        business.id,
        product.id,
        ProductStatus.ACTIVE,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      changeProductStatus(
        user.id,
        business.id,
        product.id,
        ProductStatus.DRAFT,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects invalid status values', async () => {
    const { user, business } = await createUserInBusiness(
      'product-status-invalid@example.com',
    );
    const product = await createProduct(user.id, business.id, {
      name: 'Status Invalid',
      description: 'd',
      price: 100,
      variant: { sku: 'ST-INV' },
    });

    await expect(
      changeProductStatus(user.id, business.id, product.id, 'OUT_OF_STOCK'),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      createProduct(user.id, business.id, {
        name: 'Bad status create',
        description: 'd',
        price: 100,
        status: 'OUT_OF_STOCK',
        variant: { sku: 'ST-INV2' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects invalid product input', async () => {
    const { user, business } = await createUserInBusiness(
      'product-validate@example.com',
    );
    await expect(
      createProduct(user.id, business.id, {
        name: '',
        description: 'd',
        price: 100,
        variant: { sku: 'VAL-1' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      createProduct(user.id, business.id, {
        name: 'x',
        description: 'd',
        price: -5,
        variant: { sku: 'VAL-2' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      createProduct(user.id, business.id, {
        name: 'x',
        description: 'd',
        price: 100.5,
        variant: { sku: 'VAL-3' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      createProduct(user.id, business.id, {
        name: 'x',
        description: 'd',
        price: 100,
        variant: { sku: 'VAL-4' },
        unexpectedKey: true,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('denies cross-business product access identically to not-found', async () => {
    const a = await createUserInBusiness('product-iso-a@example.com');
    const b = await createUserInBusiness('product-iso-b@example.com');
    const product = await createProduct(a.user.id, a.business.id, {
      name: 'Isolation A',
      description: 'd',
      price: 100,
      variant: { sku: 'ISO-A' },
    });

    await expect(
      getProduct(b.user.id, b.business.id, product.id),
    ).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT', status: 404 });
    await expect(
      updateProduct(b.user.id, b.business.id, product.id, { name: 'Hacked' }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT' });
    await expect(
      changeProductStatus(
        b.user.id,
        b.business.id,
        product.id,
        ProductStatus.ACTIVE,
      ),
    ).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT' });

    const missing = await getProduct(
      a.user.id,
      a.business.id,
      'does-not-exist',
    ).catch((e) => e);
    const crossTenant = await getProduct(
      b.user.id,
      b.business.id,
      product.id,
    ).catch((e) => e);
    expect(missing.code).toBe('UNKNOWN_PRODUCT');
    expect(crossTenant.code).toBe('UNKNOWN_PRODUCT');
  });

  it('denies products access to roles without the products_inventory scope', async () => {
    const { user, business } = await createUserInBusiness(
      'product-scope@example.com',
      MembershipRole.SUPPORT_AGENT,
    );
    await expect(listProducts(user.id, business.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      createProduct(user.id, business.id, {
        name: 'x',
        description: 'd',
        price: 100,
        variant: { sku: 'SCOPE-1' },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('Variants', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a variant with its own inventory', async () => {
    const { user, business } = await createUserInBusiness(
      'variant-create@example.com',
    );
    const product = await createProduct(user.id, business.id, {
      name: 'Cotton T-shirt',
      description: 'Plain cotton tee',
      price: 8000,
      variant: { sku: 'TS-BASE' },
    });

    const variant = await createVariant(user.id, business.id, {
      productId: product.id,
      name: 'Cotton T-shirt (Large)',
      sku: 'TS-LG',
      attributes: { size: 'L', color: 'white' },
    });

    expect(variant.productId).toBe(product.id);
    expect(variant.businessId).toBe(business.id);
    expect(variant.inventory).toMatchObject({ available: 0, reserved: 0 });

    const row = await prisma.inventory.findUniqueOrThrow({
      where: { productVariantId: variant.id },
    });
    expect(row.businessId).toBe(business.id);
  });

  it('creates exactly one default variant for a simple product', async () => {
    const { user, business } = await createUserInBusiness(
      'variant-simple@example.com',
    );
    const product = await createProduct(user.id, business.id, {
      name: 'Simple Product',
      description: 'No variations',
      price: 1000,
      variant: { sku: 'SP-1' },
    });
    expect(product.variants).toHaveLength(1);
  });

  it('allows multiple variants for one product', async () => {
    const { user, business } = await createUserInBusiness(
      'variant-multi@example.com',
    );
    const product = await createProduct(user.id, business.id, {
      name: 'Party Dress',
      description: 'With sizes',
      price: 20000,
      variant: { sku: 'PD-S' },
    });
    await createVariant(user.id, business.id, {
      productId: product.id,
      name: 'Party Dress M',
      sku: 'PD-M',
      attributes: { size: 'M' },
    });
    await createVariant(user.id, business.id, {
      productId: product.id,
      name: 'Party Dress L',
      sku: 'PD-L',
      attributes: { size: 'L' },
    });

    const variants = await listVariants(user.id, business.id, product.id);
    expect(variants).toHaveLength(3);
    expect(variants.map((v) => v.sku).sort()).toEqual(['PD-L', 'PD-M', 'PD-S']);
  });

  it('rejects a duplicate SKU within the same business', async () => {
    const { user, business } = await createUserInBusiness(
      'variant-dup@example.com',
    );
    const product = await createProduct(user.id, business.id, {
      name: 'Dup test',
      description: 'd',
      price: 100,
      variant: { sku: 'DUP-1' },
    });

    await expect(
      createVariant(user.id, business.id, {
        productId: product.id,
        name: 'Dup variant',
        sku: 'DUP-1',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const second = await createVariant(user.id, business.id, {
      productId: product.id,
      name: 'Second variant',
      sku: 'DUP-2',
    });
    await expect(
      updateVariant(user.id, business.id, second.id, { sku: 'DUP-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('allows the same SKU in different businesses', async () => {
    const a = await createUserInBusiness('variant-sku-a@example.com');
    const b = await createUserInBusiness('variant-sku-b@example.com');
    const productA = await createProduct(a.user.id, a.business.id, {
      name: 'A',
      description: 'd',
      price: 100,
      variant: { sku: 'SHARED-SKU' },
    });
    const productB = await createProduct(b.user.id, b.business.id, {
      name: 'B',
      description: 'd',
      price: 200,
      variant: { sku: 'SHARED-SKU' },
    });
    expect(productA.variants[0].sku).toBe('SHARED-SKU');
    expect(productB.variants[0].sku).toBe('SHARED-SKU');
    expect(productA.businessId).not.toBe(productB.businessId);
  });

  it('retrieves and updates a variant', async () => {
    const { user, business } = await createUserInBusiness(
      'variant-get@example.com',
    );
    const product = await createProduct(user.id, business.id, {
      name: 'Clutch Bag',
      description: 'd',
      price: 5000,
      variant: { sku: 'CB-1' },
    });
    const variant = product.variants[0];

    const found = await getVariant(user.id, business.id, variant.id);
    expect(found.id).toBe(variant.id);

    const updated = await updateVariant(user.id, business.id, variant.id, {
      name: 'Clutch Bag (Red)',
      attributes: { color: 'red' },
    });
    expect(updated.name).toBe('Clutch Bag (Red)');
    expect(updated.attributes).toEqual({ color: 'red' });
  });

  it('denies cross-business variant access identically to not-found', async () => {
    const a = await createUserInBusiness('variant-iso-a@example.com');
    const b = await createUserInBusiness('variant-iso-b@example.com');
    const product = await createProduct(a.user.id, a.business.id, {
      name: 'A product',
      description: 'd',
      price: 100,
      variant: { sku: 'VISO-A' },
    });
    const variant = product.variants[0];

    await expect(
      getVariant(b.user.id, b.business.id, variant.id),
    ).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT' });
    await expect(
      updateVariant(b.user.id, b.business.id, variant.id, { name: 'Hacked' }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT' });
    await expect(
      listVariants(b.user.id, b.business.id, product.id),
    ).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT' });
    await expect(
      createVariant(b.user.id, b.business.id, {
        productId: product.id,
        name: 'Foreign variant',
        sku: 'VISO-F',
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT' });
  });
});
