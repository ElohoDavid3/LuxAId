import { PrismaClient, MembershipRole, MembershipStatus, OrderStatus, ProductStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_USER_EMAIL = 'demo@orderaid.ng';
const DEMO_USER_PASSWORD = 'Password123!';
const DEMO_BUSINESS_NAME = 'Adaeze Couture & Beauty';

async function main() {
  console.log('Seeding database...');

  // 1. Create Demo User
  const passwordHash = await bcrypt.hash(DEMO_USER_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      email: DEMO_USER_EMAIL,
      name: 'Adaeze Okafor',
      passwordHash,
    },
  });

  // Idempotency guard: skip the rest if the demo business already exists for
  // this user. Running the seed twice must not create duplicate records or
  // violate unique constraints (membership, SKU, transaction reference).
  const existing = await prisma.business.findFirst({
    where: {
      name: DEMO_BUSINESS_NAME,
      memberships: { some: { userId: user.id } },
    },
    select: { id: true },
  });
  if (existing) {
    console.log('Demo data already seeded — skipping.');
    return;
  }

  // 2. Create Demo Business
  const business = await prisma.business.create({
    data: {
      name: DEMO_BUSINESS_NAME,
    },
  });

  // 3. Create Business Membership
  await prisma.businessMembership.create({
    data: {
      userId: user.id,
      businessId: business.id,
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
    },
  });

  // 4. Create Delivery Zone
  const deliveryZone = await prisma.deliveryZone.create({
    data: {
      businessId: business.id,
      name: 'Lagos Island & Lekki',
      fee: 250000, // N2,500
      coverage: ['Lekki Phase 1', 'Ikoyi', 'Victoria Island'],
    },
  });

  // 5. Create Business Settings (verified facts only — currency, support
  // contact, and policies are stored as structured JSON for the AI prompt).
  await prisma.businessSettings.create({
    data: {
      businessId: business.id,
      policies: {
        currency: 'NGN',
        supportEmail: 'support@adaezecouture.ng',
        whatsappPhoneNumber: '+2348012345678',
        returnsPolicy:
          'We offer free returns within 7 days of delivery for unworn items in original packaging.',
        deliveryPolicy:
          'Delivery within Lagos takes 24-48 hours. Nationwide delivery takes 3-5 business days.',
      },
      deliveryDefaults: {
        defaultDeliveryZoneId: deliveryZone.id,
      },
    },
  });

  // 6. Create Knowledge Sources
  await prisma.knowledgeSource.createMany({
    data: [
      {
        businessId: business.id,
        content: 'We offer free returns within 7 days of delivery for unworn items in original packaging.',
        status: 'ACTIVE',
        stale: false,
      },
      {
        businessId: business.id,
        content: 'Delivery within Lagos takes 24-48 hours. Nationwide delivery takes 3-5 business days.',
        status: 'ACTIVE',
        stale: false,
      },
    ],
  });

  // 7. Create Products, Variants & Inventory
  // The Medium/Blue variant below starts at available=14, reserved=1 because
  // the seed order (step 9) already consumed one committed unit. Inventory is
  // the single authoritative stock source — numbers here must match reality.
  const product1 = await prisma.product.create({
    data: {
      businessId: business.id,
      name: 'Ankara Evening Gown',
      description: 'Handcrafted premium silk-lined Ankara evening gown.',
      price: 3500000, // N35,000
      category: 'Gowns',
      status: ProductStatus.ACTIVE,
      variants: {
        create: [
          {
            businessId: business.id,
            name: 'Medium / Blue',
            sku: 'ANK-GWN-M-BLU',
            attributes: { size: 'M', color: 'Blue' },
            inventory: {
              create: {
                businessId: business.id,
                available: 14,
                reserved: 1,
              },
            },
          },
          {
            businessId: business.id,
            name: 'Large / Blue',
            sku: 'ANK-GWN-L-BLU',
            attributes: { size: 'L', color: 'Blue' },
            inventory: {
              create: {
                businessId: business.id,
                available: 8,
                reserved: 0,
              },
            },
          },
        ],
      },
    },
    include: { variants: { include: { inventory: true } } },
  });

  const product2 = await prisma.product.create({
    data: {
      businessId: business.id,
      name: 'Velvet Kaftan',
      description: 'Luxury embroidered velvet kaftan dress.',
      price: 4500000, // N45,000
      category: 'Kaftans',
      status: ProductStatus.ACTIVE,
      variants: {
        create: [
          {
            businessId: business.id,
            name: 'One Size / Gold',
            sku: 'VEL-KFT-OS-GLD',
            attributes: { size: 'OS', color: 'Gold' },
            inventory: {
              create: {
                businessId: business.id,
                available: 5,
                reserved: 1,
              },
            },
          },
        ],
      },
    },
    include: { variants: true },
  });

  // 8. Create Customer
  const customer = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: 'Chidinma Eze',
      email: 'chidinma@example.com',
      phone: '+2348098765432',
      location: 'Lekki Phase 1, Lagos',
    },
  });

  // 9. Create Order & Items
  const order = await prisma.order.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      status: OrderStatus.PAID,
      totalAmount: 3500000,
      items: {
        create: {
          businessId: business.id,
          productId: product1.id,
          productVariantId: product1.variants[0].id,
          quantity: 1,
          unitPrice: 3500000,
        },
      },
      paymentAttempts: {
        create: {
          businessId: business.id,
          transactionReference: 'TX-SEED-1001',
          status: 'SUCCESSFUL',
          amount: 3500000,
          currency: 'NGN',
        },
      },
      delivery: {
        create: {
          businessId: business.id,
          deliveryZoneId: deliveryZone.id,
          recipientName: 'Chidinma Eze',
          recipientPhone: '+2348098765432',
          addressLine: '12 Admiralty Way, Lekki Phase 1',
          fee: 250000,
          status: 'PENDING',
        },
      },
    },
  });

  // 9b. Record the auditable inventory trail for the committed unit.
  const soldInventory = product1.variants[0].inventory;
  if (soldInventory) {
    await prisma.inventoryMovement.createMany({
      data: [
        {
          businessId: business.id,
          inventoryId: soldInventory.id,
          quantityDelta: -1,
          reason: 'reservation',
          sourceType: 'ORDER',
          sourceId: order.id,
        },
        {
          businessId: business.id,
          inventoryId: soldInventory.id,
          quantityDelta: -1,
          reason: 'commitment',
          sourceType: 'ORDER',
          sourceId: order.id,
        },
      ],
    });
  }

  // 10. Create Conversation & Message
  await prisma.conversation.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      channel: 'whatsapp',
      status: 'ACTIVE',
      controlState: 'AI_CONTROLLED',
      messages: {
        create: [
          {
            businessId: business.id,
            authorType: 'CUSTOMER',
            direction: 'INBOUND',
            channel: 'whatsapp',
            body: 'Hello, I want to order the Ankara Evening Gown in Medium.',
            status: 'SENT',
          },
          {
            businessId: business.id,
            authorType: 'AI',
            direction: 'OUTBOUND',
            channel: 'whatsapp',
            body: 'Hi Chidinma! The Ankara Evening Gown in Medium is available for ₦35,000. Would you like to proceed with payment?',
            status: 'SENT',
          },
        ],
      },
    },
  });

  console.log('Seeding completed successfully!');
  console.log(`Demo User: ${DEMO_USER_EMAIL} / ${DEMO_USER_PASSWORD}`);
  console.log(`Business ID: ${business.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });