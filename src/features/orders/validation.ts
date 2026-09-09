import { z } from 'zod';

/** Schema for creating an order */
export const CreateOrderSchema = z.object({
  customerId: z.string().min(1),
  items: z.array(
    z.object({
      productVariantId: z.string().min(1),
      quantity: z.number().int().positive(),
    }),
  ).min(1),
});

/** Schema for updating order status */
export const UpdateStatusSchema = z.object({
  status: z.enum([
    'DRAFT',
    'AWAITING_PAYMENT',
    'PAID',
    'PROCESSING',
    'READY_FOR_DELIVERY',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'FAILED',
    'REFUNDED',
  ]),
});
