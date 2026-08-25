import { prisma } from '@/lib/prisma';

export interface AnalyticsSummary {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  activeProducts: number;
  paymentSuccessRate: number;
  averageOrderValue: number;
}

export interface DailyRevenue {
  date: string;
  revenue: number;
  orders: number;
}

export interface OrderStatusBreakdown {
  status: string;
  count: number;
  totalAmount: number;
}

export interface TopProduct {
  productId: string;
  productName: string;
  totalRevenue: number;
  totalQuantity: number;
  orderCount: number;
}

export interface ConversationMetrics {
  totalConversations: number;
  aiResolved: number;
  humanEscalated: number;
  avgMessagesPerConversation: number;
}

export async function getAnalyticsSummary(businessId: string): Promise<AnalyticsSummary> {
  const [
    revenueResult,
    totalOrders,
    totalCustomers,
    activeProducts,
    successfulPayments,
    totalPayments,
  ] = await Promise.all([
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { businessId, status: 'PAID' },
    }),
    prisma.order.count({ where: { businessId } }),
    prisma.customer.count({ where: { businessId } }),
    prisma.product.count({ where: { businessId, status: 'ACTIVE' } }),
    prisma.paymentAttempt.count({
      where: { businessId, status: 'SUCCESSFUL' },
    }),
    prisma.paymentAttempt.count({ where: { businessId } }),
  ]);

  const totalRevenue = revenueResult._sum.totalAmount ?? 0;
  const paymentSuccessRate = totalPayments > 0
    ? Math.round((successfulPayments / totalPayments) * 100)
    : 0;
  const averageOrderValue = totalOrders > 0
    ? Math.round(totalRevenue / totalOrders)
    : 0;

  return {
    totalRevenue,
    totalOrders,
    totalCustomers,
    activeProducts,
    paymentSuccessRate,
    averageOrderValue,
  };
}

export async function getRevenueByDay(businessId: string, days: number = 7): Promise<DailyRevenue[]> {
  const now = new Date();
  const results: DailyRevenue[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

    const [revenueResult, orderCount] = await Promise.all([
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          businessId,
          status: 'PAID',
          createdAt: { gte: startOfDay, lt: endOfDay },
        },
      }),
      prisma.order.count({
        where: {
          businessId,
          createdAt: { gte: startOfDay, lt: endOfDay },
        },
      }),
    ]);

    results.push({
      date: startOfDay.toISOString().split('T')[0],
      revenue: revenueResult._sum.totalAmount ?? 0,
      orders: orderCount,
    });
  }

  return results;
}

export async function getOrderStatusBreakdown(businessId: string): Promise<OrderStatusBreakdown[]> {
  const statuses = [
    'DRAFT', 'AWAITING_PAYMENT', 'PAID', 'PROCESSING',
    'READY_FOR_DELIVERY', 'SHIPPED', 'DELIVERED',
    'RETURNED', 'CANCELLED', 'FAILED', 'REFUNDED',
  ];

  const results = await Promise.all(
    statuses.map(async (status) => {
      const [count, amountResult] = await Promise.all([
        prisma.order.count({ where: { businessId, status: status as never } }),
        prisma.order.aggregate({
          _sum: { totalAmount: true },
          where: { businessId, status: status as never },
        }),
      ]);
      return {
        status,
        count,
        totalAmount: amountResult._sum.totalAmount ?? 0,
      };
    })
  );

  return results.filter((r) => r.count > 0);
}

export async function getTopProducts(businessId: string, limit: number = 5): Promise<TopProduct[]> {
  const topItems = await prisma.orderItem.groupBy({
    by: ['productId'],
    _sum: { unitPrice: true, quantity: true },
    _count: { id: true },
    where: { businessId },
    orderBy: { _sum: { unitPrice: 'desc' } },
    take: limit,
  });

  const productIds = topItems.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });

  const productMap = new Map(products.map((p) => [p.id, p.name]));

  return topItems.map((item) => ({
    productId: item.productId,
    productName: productMap.get(item.productId) ?? 'Unknown product',
    totalRevenue: item._sum.unitPrice ?? 0,
    totalQuantity: item._sum.quantity ?? 0,
    orderCount: item._count.id,
  }));
}

export async function getConversationMetrics(businessId: string): Promise<ConversationMetrics> {
  const [totalConversations, aiControlled, humanControlled] = await Promise.all([
    prisma.conversation.count({ where: { businessId } }),
    prisma.conversation.count({
      where: { businessId, controlState: 'AI_CONTROLLED' },
    }),
    prisma.conversation.count({
      where: { businessId, controlState: 'HUMAN_CONTROLLED' },
    }),
  ]);

  const messageCount = await prisma.message.count({
    where: { businessId },
  });

  const avgMessagesPerConversation = totalConversations > 0
    ? Math.round((messageCount / totalConversations) * 10) / 10
    : 0;

  return {
    totalConversations,
    aiResolved: aiControlled,
    humanEscalated: humanControlled,
    avgMessagesPerConversation,
  };
}
