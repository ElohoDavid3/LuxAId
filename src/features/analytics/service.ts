import { prisma } from '@/lib/prisma';
import { OrderStatus } from '@prisma/client';

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

// A draft is not yet a real order: the customer has not submitted it.
// Cancelled orders never produced revenue and are excluded from headline
// order volume so the dashboard metric reflects actual commerce.
const ORDER_VOLUME_STATUSES = [
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

export async function getAnalyticsSummary(businessId: string): Promise<AnalyticsSummary> {
  const [
    revenueResult,
    totalOrders,
    paidOrderCount,
    totalCustomers,
    activeProducts,
    successfulPayments,
    totalPayments,
  ] = await Promise.all([
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { businessId, status: OrderStatus.PAID },
    }),
    prisma.order.count({
      where: { businessId, status: { in: ORDER_VOLUME_STATUSES } },
    }),
    prisma.order.count({
      where: { businessId, status: OrderStatus.PAID },
    }),
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
  // Revenue is only ever earned from paid orders, so AOV must divide by
  // paid order count — otherwise unpaid/abandoned orders dilute the figure.
  const averageOrderValue = paidOrderCount > 0
    ? Math.round(totalRevenue / paidOrderCount)
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
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));

  const orders = await prisma.order.findMany({
    where: {
      businessId,
      status: OrderStatus.PAID,
      createdAt: { gte: startDate },
    },
    select: {
      createdAt: true,
      totalAmount: true,
    },
  });

  function toLocalDateStr(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const dailyMap = new Map<string, { revenue: number; orders: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    dailyMap.set(toLocalDateStr(d), { revenue: 0, orders: 0 });
  }

  // Only PAID orders earn revenue; the daily chart counts paid orders only so
  // "orders" and "revenue" describe the same set of transactions.
  for (const order of orders) {
    const dateStr = toLocalDateStr(order.createdAt);
    const entry = dailyMap.get(dateStr);
    if (entry) {
      entry.orders += 1;
      entry.revenue += order.totalAmount;
    }
  }

  return Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    revenue: data.revenue,
    orders: data.orders,
  }));
}

export async function getOrderStatusBreakdown(businessId: string): Promise<OrderStatusBreakdown[]> {
  const grouped = await prisma.order.groupBy({
    by: ['status'],
    _count: { _all: true },
    _sum: { totalAmount: true },
    where: { businessId },
  });

  return grouped.map((g) => ({
    status: g.status,
    count: g._count._all,
    totalAmount: g._sum.totalAmount ?? 0,
  }));
}

export async function getTopProducts(businessId: string, limit: number = 5): Promise<TopProduct[]> {
  const topItems = await prisma.orderItem.groupBy({
    by: ['productId'],
    _sum: { unitPrice: true, quantity: true },
    _count: { id: true },
    where: {
      businessId,
      order: { status: OrderStatus.PAID },
    },
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
  const [totalConversations, escalatedConversations, messageCount] = await Promise.all([
    prisma.conversation.count({ where: { businessId } }),
    prisma.escalation.groupBy({
      by: ['conversationId'],
      where: { businessId },
      _count: { conversationId: true },
    }),
    prisma.message.count({ where: { businessId } }),
  ]);

  // A conversation only ever needed a human if it produced an Escalation
  // record. Everything else is attributed to AI (it never required a human).
  const humanEscalated = escalatedConversations.length;
  const aiResolved = Math.max(0, totalConversations - humanEscalated);

  const avgMessagesPerConversation = totalConversations > 0
    ? Math.round((messageCount / totalConversations) * 10) / 10
    : 0;

  return {
    totalConversations,
    aiResolved,
    humanEscalated,
    avgMessagesPerConversation,
  };
}
