import { OrderStatus, ProductStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { AppError } from '../src/lib/errors';
import { resetDatabase, createUserInBusiness } from './helpers';
import { createCustomer } from '../src/features/customers/customer.service';
import { createProduct } from '../src/features/products/product.service';
import { setStock } from '../src/features/products/inventory.service';
import { createOrder, getOrder } from '../src/features/orders/order.service';

beforeAll(() => resetDatabase());

afterAll(() => prisma.$disconnect());

async function setupProductWithStock(
  userId: string,
  businessId: string,
  price: number = 5000,
  stock: number = 10,
) {
  const product = await createProduct(userId, businessId, {
    name: 'Test Product',
    description: 'A test product',
    price,
    status: ProductStatus.ACTIVE,
    variant: {
      sku: `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Default',
    },
  });
  const variant = product.variants[0];
  await setStock(userId, businessId, {
    variantId: variant.id,
    available: stock,
  });
  return { product, variant };
}

describe('Order service', () => {
  describe('createOrder', () => {
    it('creates an order with correct total and AWAITING_PAYMENT status', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-order-create@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Order Customer',
      });
      const { product, variant } = await setupProductWithStock(
        user.id,
        business.id,
        5000,
        10,
      );

      const order = await createOrder(user.id, business.id, {
        customerId: customer.id,
        items: [{ variantId: variant.id, quantity: 3 }],
      });

      expect(order.status).toBe(OrderStatus.AWAITING_PAYMENT);
      expect(order.totalAmount).toBe(15000);
      expect(order.customerId).toBe(customer.id);
      expect(order.businessId).toBe(business.id);
      expect(order.items).toHaveLength(1);
      expect(order.items[0].quantity).toBe(3);
      expect(order.items[0].unitPrice).toBe(5000);
    });

    it('throws INSUFFICIENT_STOCK when stock is low', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-order-nostock@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'No Stock Customer',
      });
      const { variant } = await setupProductWithStock(
        user.id,
        business.id,
        5000,
        2,
      );

      await expect(
        createOrder(user.id, business.id, {
          customerId: customer.id,
          items: [{ variantId: variant.id, quantity: 5 }],
        }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    });

    it('throws UNKNOWN_PRODUCT for nonexistent variant', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-order-novar@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'No Variant Customer',
      });

      await expect(
        createOrder(user.id, business.id, {
          customerId: customer.id,
          items: [{ variantId: 'nonexistent-variant', quantity: 1 }],
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT' });
    });

    it('throws UNKNOWN_CUSTOMER for nonexistent customer', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-order-nocust@test.com',
      );
      const { variant } = await setupProductWithStock(user.id, business.id);

      await expect(
        createOrder(user.id, business.id, {
          customerId: 'nonexistent-customer',
          items: [{ variantId: variant.id, quantity: 1 }],
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CUSTOMER' });
    });

    it('reserves inventory after order creation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-order-reserve@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Reserve Customer',
      });
      const { product, variant } = await setupProductWithStock(
        user.id,
        business.id,
        1000,
        10,
      );

      await createOrder(user.id, business.id, {
        customerId: customer.id,
        items: [{ variantId: variant.id, quantity: 4 }],
      });

      const inventory = await prisma.inventory.findFirst({
        where: { productVariantId: variant.id },
      });
      expect(inventory).not.toBeNull();
      expect(inventory!.available).toBe(6);
      expect(inventory!.reserved).toBe(4);
    });
  });

  describe('getOrder', () => {
    it('retrieves an order by id', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-order-get@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Get Order Customer',
      });
      const { variant } = await setupProductWithStock(user.id, business.id);

      const created = await createOrder(user.id, business.id, {
        customerId: customer.id,
        items: [{ variantId: variant.id, quantity: 1 }],
      });

      const fetched = await getOrder(user.id, business.id, created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.status).toBe(OrderStatus.AWAITING_PAYMENT);
    });

    it('throws UNKNOWN_ORDER for nonexistent order', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-order-get-miss@test.com',
      );
      await expect(
        getOrder(user.id, business.id, 'nonexistent-order'),
      ).rejects.toMatchObject({ code: 'UNKNOWN_ORDER' });
    });

    it('rejects cross-business access', async () => {
      const ownerA = await createUserInBusiness('owner-order-xa@test.com');
      const ownerB = await createUserInBusiness('owner-order-xb@test.com');
      const customerA = await createCustomer(
        ownerA.user.id,
        ownerA.business.id,
        { name: 'Customer A' },
      );
      const { variant } = await setupProductWithStock(
        ownerA.user.id,
        ownerA.business.id,
      );
      const orderA = await createOrder(ownerA.user.id, ownerA.business.id, {
        customerId: customerA.id,
        items: [{ variantId: variant.id, quantity: 1 }],
      });

      await expect(
        getOrder(ownerB.user.id, ownerB.business.id, orderA.id),
      ).rejects.toMatchObject({ code: 'UNKNOWN_ORDER' });
    });
  });
});
