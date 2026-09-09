import { prisma } from '../src/lib/prisma';
import {
  getAnalyticsSummary,
  getRevenueByDay,
  getOrderStatusBreakdown,
  getTopProducts,
  getConversationMetrics,
} from '../src/features/analytics/service';
import { createUserInBusiness, resetDatabase } from './helpers';
import { OrderStatus } from '@prisma/client';

describe('Analytics service', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('calculates accurate summary analytics', async () => {
    const { business } = await createUserInBusiness('owner-analytics@test.com');

    // Create products
    const product = await prisma.product.create({
      data: {
        businessId: business.id,
        name: 'Test Product',
        description: 'Description',
        price: 500000, // N5,000
        status: 'ACTIVE',
      },
    });

    // Create customer
    const customer = await prisma.customer.create({
      data: {
        businessId: business.id,
        name: 'Test Customer',
        phone: '+2348000000000',
      },
    });

    // Create paid order
    const paidOrder = await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.PAID,
        totalAmount: 500000,
      },
    });

    // Create awaiting payment order
    await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.AWAITING_PAYMENT,
        totalAmount: 300000,
      },
    });

    // Create successful payment attempt
    await prisma.paymentAttempt.create({
      data: {
        businessId: business.id,
        orderId: paidOrder.id,
        transactionReference: 'TX-111',
        status: 'SUCCESSFUL',
        amount: 500000,
        currency: 'NGN',
      },
    });

    const summary = await getAnalyticsSummary(business.id);

    expect(summary.totalRevenue).toBe(500000);
    expect(summary.totalOrders).toBe(2);
    expect(summary.totalCustomers).toBe(1);
    expect(summary.activeProducts).toBe(1);
    expect(summary.paymentSuccessRate).toBe(100);
    // AOV divides revenue by PAID orders only, so unpaid orders don't dilute it.
    expect(summary.averageOrderValue).toBe(500000);
  });

  it('excludes draft and cancelled orders from order volume and AOV', async () => {
    const { business } = await createUserInBusiness('owner-aov@test.com');
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'AOV Customer' },
    });

    await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.DRAFT,
        totalAmount: 900000,
      },
    });
    await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.CANCELLED,
        totalAmount: 900000,
      },
    });
    await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.PAID,
        totalAmount: 400000,
      },
    });

    const summary = await getAnalyticsSummary(business.id);
    expect(summary.totalOrders).toBe(1);
    expect(summary.averageOrderValue).toBe(400000);
  });

  it('returns daily revenue breakdown aggregated by day', async () => {
    const { business } = await createUserInBusiness('daily-revenue@test.com');
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Daily Customer' },
    });

    await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.PAID,
        totalAmount: 100000,
      },
    });

    const daily = await getRevenueByDay(business.id, 7);
    expect(daily.length).toBe(7);
    const now = new Date();
    const todayStr = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const todayData = daily.find((d) => d.date === todayStr);
    expect(todayData).toBeDefined();
    expect(todayData?.revenue).toBe(100000);
    expect(todayData?.orders).toBe(1);
  });

  it('excludes unpaid orders from the daily revenue chart', async () => {
    const { business } = await createUserInBusiness('daily-unpaid@test.com');
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Daily Unpaid Customer' },
    });

    await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.AWAITING_PAYMENT,
        totalAmount: 300000,
      },
    });
    await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.CANCELLED,
        totalAmount: 500000,
      },
    });

    const daily = await getRevenueByDay(business.id, 7);
    const todayStr = [
      new Date().getFullYear(),
      String(new Date().getMonth() + 1).padStart(2, '0'),
      String(new Date().getDate()).padStart(2, '0'),
    ].join('-');
    const todayData = daily.find((d) => d.date === todayStr);
    expect(todayData).toBeDefined();
    expect(todayData?.revenue).toBe(0);
    expect(todayData?.orders).toBe(0);
  });

  it('returns status breakdown grouped by order status', async () => {
    const { business } = await createUserInBusiness('status-breakdown@test.com');
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Status Customer' },
    });

    await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.PAID,
        totalAmount: 200000,
      },
    });
    await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.SHIPPED,
        totalAmount: 150000,
      },
    });

    const breakdown = await getOrderStatusBreakdown(business.id);
    expect(breakdown.length).toBe(2);
    const paid = breakdown.find((b) => b.status === OrderStatus.PAID);
    expect(paid?.count).toBe(1);
    expect(paid?.totalAmount).toBe(200000);
  });

  it('returns top products ranked by revenue', async () => {
    const { business } = await createUserInBusiness('top-products@test.com');
    const p1 = await prisma.product.create({
      data: { businessId: business.id, name: 'Item A', description: 'Desc', price: 10000, status: 'ACTIVE' },
    });
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Top Customer' },
    });
    const order = await prisma.order.create({
      data: { businessId: business.id, customerId: customer.id, status: OrderStatus.PAID, totalAmount: 20000 },
    });

    await prisma.orderItem.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        productId: p1.id,
        quantity: 2,
        unitPrice: 10000,
      },
    });

    const top = await getTopProducts(business.id, 5);
    expect(top.length).toBe(1);
    expect(top[0].productId).toBe(p1.id);
    expect(top[0].productName).toBe('Item A');
    expect(top[0].totalQuantity).toBe(2);
  });

  it('computes conversation metrics based on escalation records', async () => {
    const { business } = await createUserInBusiness('conv-metrics@test.com');
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Conv Customer' },
    });

    const conv = await prisma.conversation.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        controlState: 'AI_CONTROLLED',
        status: 'ACTIVE',
      },
    });

    await prisma.message.create({
      data: {
        businessId: business.id,
        conversationId: conv.id,
        authorType: 'CUSTOMER',
        direction: 'INBOUND',
        status: 'SENT',
        channel: 'internal',
        body: 'Hello',
      },
    });

    const metrics = await getConversationMetrics(business.id);
    expect(metrics.totalConversations).toBe(1);
    expect(metrics.aiResolved).toBe(1);
    expect(metrics.humanEscalated).toBe(0);
    expect(metrics.avgMessagesPerConversation).toBe(1);
  });

  it('counts escalated conversations as human-handled', async () => {
    const { business } = await createUserInBusiness('conv-escalated@test.com');
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Escalated Customer' },
    });

    const escalated = await prisma.conversation.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        controlState: 'HUMAN_CONTROLLED',
        status: 'ACTIVE',
      },
    });
    await prisma.escalation.create({
      data: {
        businessId: business.id,
        conversationId: escalated.id,
        reason: 'VIP priority',
        status: 'RESOLVED',
      },
    });

    const aiConv = await prisma.conversation.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        controlState: 'AI_CONTROLLED',
        status: 'ACTIVE',
      },
    });
    await prisma.message.create({
      data: {
        businessId: business.id,
        conversationId: aiConv.id,
        authorType: 'CUSTOMER',
        direction: 'INBOUND',
        status: 'SENT',
        channel: 'internal',
        body: 'Hi',
      },
    });

    const metrics = await getConversationMetrics(business.id);
    expect(metrics.totalConversations).toBe(2);
    expect(metrics.aiResolved).toBe(1);
    expect(metrics.humanEscalated).toBe(1);
  });
});
