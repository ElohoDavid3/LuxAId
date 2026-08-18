import type { LLMTool } from '../llm/provider';

export const TOOL_DEFINITIONS: LLMTool[] = [
  {
    name: 'search_products',
    description:
      'Search active products by name or description. Returns matching products with prices and stock info.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term to match against product name or description',
        },
        minPrice: {
          type: 'number',
          description: 'Minimum price filter in kobo',
        },
        maxPrice: {
          type: 'number',
          description: 'Maximum price filter in kobo',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product',
    description: 'Get full details of a specific product including variants and inventory.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The product ID',
        },
      },
      required: ['productId'],
    },
  },
  {
    name: 'check_stock',
    description: 'Check if a specific product variant has sufficient stock for a requested quantity.',
    parameters: {
      type: 'object',
      properties: {
        variantId: {
          type: 'string',
          description: 'The product variant ID',
        },
        quantity: {
          type: 'number',
          description: 'The quantity to check',
        },
      },
      required: ['variantId', 'quantity'],
    },
  },
  {
    name: 'list_delivery_zones',
    description: 'List available delivery zones with their fees and coverage areas.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_order',
    description:
      'Create an order with the specified items. The order will be in AWAITING_PAYMENT status after creation.',
    parameters: {
      type: 'object',
      properties: {
        customerId: {
          type: 'string',
          description: 'The customer ID',
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              variantId: {
                type: 'string',
                description: 'The product variant ID',
              },
              quantity: {
                type: 'number',
                description: 'The quantity to order',
              },
            },
            required: ['variantId', 'quantity'],
          },
          description: 'List of items to order',
        },
        deliveryZoneId: {
          type: 'string',
          description: 'Optional delivery zone ID',
        },
      },
      required: ['customerId', 'items'],
    },
  },
  {
    name: 'initiate_payment',
    description: 'Create a payment attempt for an order. The order must be in AWAITING_PAYMENT status.',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'The order ID',
        },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'get_order',
    description: 'Get details of an order including items, customer, and payment status.',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'The order ID',
        },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'escalate_to_human',
    description:
      'Escalate the conversation to a human operator. Use when you cannot safely answer or the customer requests a human.',
    parameters: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          description: 'The conversation ID',
        },
        reason: {
          type: 'string',
          description: 'Reason for escalation',
        },
      },
      required: ['conversationId', 'reason'],
    },
  },
];
