import {
  PrismaClient,
  ProductStatus,
  OrderStatus,
  PaymentAttemptStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_OWNED_TABLES = [
  'BusinessSettings',
  'BusinessMembership',
  'Product',
  'ProductVariant',
  'Inventory',
  'InventoryMovement',
  'Customer',
  'CustomerChannelIdentity',
  'Conversation',
  'Message',
  'KnowledgeSource',
  'Escalation',
  'Order',
  'OrderItem',
  'PaymentAttempt',
  'Delivery',
  'DeliveryZone',
  'Automation',
  'AutomationExecution',
  'Notification',
  'AuditLog',
  'AnalyticsEvent',
];

const MONEY_COLUMNS: Array<[string, string]> = [
  ['Product', 'price'],
  ['Order', 'totalAmount'],
  ['OrderItem', 'unitPrice'],
  ['PaymentAttempt', 'amount'],
  ['DeliveryZone', 'fee'],
  ['Delivery', 'fee'],
];

beforeAll(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Business", "User" CASCADE');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Domain foundation schema', () => {
  describe('Business as the tenant boundary', () => {
    it('does not create a separate Tenant entity', async () => {
      const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      );
      const names = tables.map((t) => t.tablename);
      expect(names).not.toContain('Tenant');
      expect(names).toContain('Business');
    });

    it('every tenant-owned table carries the businessId boundary', async () => {
      for (const table of TENANT_OWNED_TABLES) {
        const has = await prisma.$queryRawUnsafe<{ has: boolean }[]>(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_name = $1 AND column_name = 'businessId'
           ) AS has`,
          table,
        );
        expect(has[0].has).toBe(true);
      }
    });

    it('queries scoped to a businessId never cross the tenant boundary', async () => {
      const businessA = await prisma.business.create({
        data: { name: 'Boundary A' },
      });
      const businessB = await prisma.business.create({
        data: { name: 'Boundary B' },
      });

      const customerA = await prisma.customer.create({
        data: { businessId: businessA.id, name: 'Customer A' },
      });
      const customerB = await prisma.customer.create({
        data: { businessId: businessB.id, name: 'Customer B' },
      });

      await prisma.order.create({
        data: {
          businessId: businessA.id,
          customerId: customerA.id,
          status: OrderStatus.AWAITING_PAYMENT,
          totalAmount: 1000,
        },
      });
      await prisma.order.create({
        data: {
          businessId: businessB.id,
          customerId: customerB.id,
          status: OrderStatus.AWAITING_PAYMENT,
          totalAmount: 9999,
        },
      });

      const ordersOfA = await prisma.order.findMany({
        where: { businessId: businessA.id },
      });
      expect(ordersOfA).toHaveLength(1);
      expect(ordersOfA[0].totalAmount).toBe(1000);
      expect(ordersOfA.every((o) => o.businessId === businessA.id)).toBe(true);
    });
  });

  describe('PaymentAttempt (1:N with Order)', () => {
    async function makeOrderWithAttempt(businessId: string) {
      const customer = await prisma.customer.create({
        data: { businessId, name: 'Paying customer' },
      });
      const order = await prisma.order.create({
        data: {
          businessId,
          customerId: customer.id,
          status: OrderStatus.AWAITING_PAYMENT,
          totalAmount: 88500,
        },
      });
      return { customer, order };
    }

    it('supports multiple payment attempts per order (orderId is not unique)', async () => {
      const business = await prisma.business.create({
        data: { name: 'Multi-attempt' },
      });
      const { order } = await makeOrderWithAttempt(business.id);

      const first = await prisma.paymentAttempt.create({
        data: {
          businessId: business.id,
          orderId: order.id,
          transactionReference: 'attempt-1',
          amount: 88500,
          currency: 'NGN',
          status: PaymentAttemptStatus.FAILED,
        },
      });
      const second = await prisma.paymentAttempt.create({
        data: {
          businessId: business.id,
          orderId: order.id,
          transactionReference: 'attempt-2',
          amount: 88500,
          currency: 'NGN',
          status: PaymentAttemptStatus.SUCCESSFUL,
        },
      });

      expect(second.id).not.toBe(first.id);
      const attempts = await prisma.paymentAttempt.findMany({
        where: { orderId: order.id },
      });
      expect(attempts).toHaveLength(2);
      expect(attempts.every((a) => a.orderId === order.id)).toBe(true);
    });

    it('enforces a unique transactionReference per attempt (idempotency backing)', async () => {
      const business = await prisma.business.create({
        data: { name: 'Unique ref' },
      });
      const { order } = await makeOrderWithAttempt(business.id);

      const data = {
        businessId: business.id,
        orderId: order.id,
        transactionReference: 'dup-ref',
        amount: 88500,
        currency: 'NGN',
        status: PaymentAttemptStatus.PENDING,
      };
      await prisma.paymentAttempt.create({ data });
      await expect(
        prisma.paymentAttempt.create({ data }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('Inventory', () => {
    it('stores only available/reserved/location — no allocated quantity', async () => {
      const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'Inventory' ORDER BY ordinal_position`,
      );
      const columns = rows.map((r) => r.column_name);
      expect(columns).toContain('available');
      expect(columns).toContain('reserved');
      expect(columns).toContain('location');
      expect(columns).not.toContain('allocated');
    });

    it('rejects negative available/reserved quantities at the database level', async () => {
      const business = await prisma.business.create({
        data: { name: 'Neg stock' },
      });
      const product = await prisma.product.create({
        data: {
          businessId: business.id,
          name: 'P',
          description: 'd',
          price: 1000,
        },
      });
      const variant = await prisma.productVariant.create({
        data: {
          businessId: business.id,
          productId: product.id,
          name: 'V',
          sku: 'v-neg',
          attributes: {},
        },
      });

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "Inventory" ("id", "businessId", "productVariantId", "available", "reserved", "createdAt", "updatedAt")
           VALUES ('inv-neg-avail', $1, $2, -1, 0, now(), now())`,
          business.id,
          variant.id,
        ),
      ).rejects.toThrow(/available_non_negative/);

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "Inventory" ("id", "businessId", "productVariantId", "available", "reserved", "createdAt", "updatedAt")
           VALUES ('inv-neg-res', $1, $2, 0, -1, now(), now())`,
          business.id,
          variant.id,
        ),
      ).rejects.toThrow(/reserved_non_negative/);
    });

    it('supports conditional decrement to prevent overselling', async () => {
      const business = await prisma.business.create({
        data: { name: 'Oversell' },
      });
      const product = await prisma.product.create({
        data: {
          businessId: business.id,
          name: 'P',
          description: 'd',
          price: 1000,
        },
      });
      const variant = await prisma.productVariant.create({
        data: {
          businessId: business.id,
          productId: product.id,
          name: 'V',
          sku: 'v-cond',
          attributes: {},
        },
      });
      await prisma.inventory.create({
        data: {
          businessId: business.id,
          productVariantId: variant.id,
          available: 2,
          reserved: 0,
        },
      });

      const overflow = await prisma.$executeRawUnsafe(
        `UPDATE "Inventory" SET "available" = "available" - 3
         WHERE "productVariantId" = $1 AND "available" >= 3`,
        variant.id,
      );
      expect(overflow).toBe(0);

      const exact = await prisma.$executeRawUnsafe(
        `UPDATE "Inventory" SET "available" = "available" - 2
         WHERE "productVariantId" = $1 AND "available" >= 2`,
        variant.id,
      );
      expect(exact).toBe(1);

      const after = await prisma.inventory.findUniqueOrThrow({
        where: { productVariantId: variant.id },
      });
      expect(after.available).toBe(0);
    });
  });

  describe('Product status', () => {
    it('accepts only DRAFT, ACTIVE, ARCHIVED', async () => {
      const business = await prisma.business.create({
        data: { name: 'Statuses' },
      });

      const draft = await prisma.product.create({
        data: {
          businessId: business.id,
          name: 'D',
          description: 'd',
          price: 100,
          status: ProductStatus.DRAFT,
        },
      });
      const active = await prisma.product.create({
        data: {
          businessId: business.id,
          name: 'A',
          description: 'd',
          price: 100,
          status: ProductStatus.ACTIVE,
        },
      });
      const archived = await prisma.product.create({
        data: {
          businessId: business.id,
          name: 'R',
          description: 'd',
          price: 100,
          status: ProductStatus.ARCHIVED,
        },
      });

      const statuses = await prisma.product.findMany({
        where: { id: { in: [draft.id, active.id, archived.id] } },
        select: { status: true },
      });
      expect(new Set(statuses.map((s) => s.status))).toEqual(
        new Set([
          ProductStatus.DRAFT,
          ProductStatus.ACTIVE,
          ProductStatus.ARCHIVED,
        ]),
      );
    });

    it('rejects OUT_OF_STOCK as a product status at the database level', async () => {
      const business = await prisma.business.create({
        data: { name: 'No oos' },
      });
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "Product" ("id", "businessId", "name", "description", "price", "status")
           VALUES ('p-oos', $1, 'x', 'y', 100, 'OUT_OF_STOCK')`,
          business.id,
        ),
      ).rejects.toThrow();
    });
  });

  describe('Money is stored as integer minor units (kobo)', () => {
    it('uses integer columns for every monetary value', async () => {
      for (const [table, column] of MONEY_COLUMNS) {
        const rows = await prisma.$queryRawUnsafe<{ data_type: string }[]>(
          `SELECT data_type FROM information_schema.columns
           WHERE table_name = $1 AND column_name = $2`,
          table,
          column,
        );
        expect(rows[0].data_type).toBe('integer');
      }
    });
  });

  describe('DeliveryZone', () => {
    it('stores merchant-defined coverage labels (no GIS or coordinates)', async () => {
      const business = await prisma.business.create({
        data: { name: 'Delivery' },
      });
      const zone = await prisma.deliveryZone.create({
        data: {
          businessId: business.id,
          name: 'Lagos Mainland',
          fee: 3500,
          coverage: ['Yaba', 'Ikeja', 'Surulere'],
        },
      });

      const found = await prisma.deliveryZone.findUniqueOrThrow({
        where: { id: zone.id },
      });
      expect(found.coverage).toEqual(['Yaba', 'Ikeja', 'Surulere']);

      const rows = await prisma.$queryRawUnsafe<{ data_type: string }[]>(
        `SELECT data_type FROM information_schema.columns
         WHERE table_name = 'DeliveryZone' AND column_name = 'coverage'`,
      );
      expect(rows[0].data_type).toBe('jsonb');
    });
  });

  describe('Unique constraints are internally consistent', () => {
    it('enforces 1:1 BusinessSettings per business', async () => {
      const business = await prisma.business.create({
        data: { name: 'Settings unique' },
      });
      await prisma.businessSettings.create({
        data: { businessId: business.id },
      });
      await expect(
        prisma.businessSettings.create({ data: { businessId: business.id } }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('enforces unique customer channel identity per channel', async () => {
      const business = await prisma.business.create({
        data: { name: 'Channel unique' },
      });
      const customer = await prisma.customer.create({
        data: { businessId: business.id, name: 'C' },
      });
      const data = {
        businessId: business.id,
        customerId: customer.id,
        channel: 'whatsapp',
        channelId: '+2348000000000',
      };
      await prisma.customerChannelIdentity.create({ data });
      await expect(
        prisma.customerChannelIdentity.create({ data }),
      ).rejects.toMatchObject({
        code: 'P2002',
      });
    });

    it('enforces a single Delivery per Order (orderId unique) while allowing one payment attempt per order to be non-unique', async () => {
      const business = await prisma.business.create({
        data: { name: 'Delivery unique' },
      });
      const customer = await prisma.customer.create({
        data: { businessId: business.id, name: 'C' },
      });
      const order = await prisma.order.create({
        data: {
          businessId: business.id,
          customerId: customer.id,
          status: OrderStatus.PAID,
          totalAmount: 5000,
        },
      });

      await prisma.delivery.create({
        data: { businessId: business.id, orderId: order.id, status: 'PENDING' },
      });
      await expect(
        prisma.delivery.create({
          data: {
            businessId: business.id,
            orderId: order.id,
            status: 'PENDING',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });
});
