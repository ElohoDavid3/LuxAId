import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/session';
import { Card } from '@/components/Card/Card';
import buttonStyles from '@/components/Button/Button.module.css';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import {
  ProductGrid,
  type EditableProduct,
} from '@/components/Products/ProductGrid/ProductGrid';
import type { ProductTag } from '@/components/ProductCard/ProductCard';

export const metadata: Metadata = { title: 'Products' };

async function getProducts(businessId: string): Promise<EditableProduct[]> {
  const products = await prisma.product.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    include: {
      variants: {
        include: {
          inventory: { select: { available: true } },
        },
      },
    },
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    category: p.category,
    price: p.price,
    priceLabel: formatNaira(p.price),
    tags: stockTags(
      p.variants.reduce((sum, v) => sum + (v.inventory?.available ?? 0), 0),
      p.status,
    ),
  }));
}

function formatNaira(kobo: number) {
  return '\u20A6' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 });
}

function stockTags(totalStock: number, status: string): ProductTag[] {
  if (status === 'DRAFT') {
    return [{ label: 'Draft', tone: 'warning' }];
  }
  if (totalStock === 0) {
    return [{ label: 'Out of stock', tone: 'error' }];
  }
  if (totalStock <= 5) {
    return [{ label: `Low stock \u00B7 ${totalStock} left`, tone: 'info' }];
  }
  return [{ label: `${totalStock} in stock`, tone: 'success' }];
}

export default async function ProductsPage() {
  const session = await requireDashboardSession();
  const products = await getProducts(session.businessId);

  return (
    <div>
      <div style={{ padding: '1.5rem 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
          <Link
            href="/products/new"
            className={[buttonStyles.btn, buttonStyles.primary].join(' ')}
          >
            <span aria-hidden>+</span>
            Add product
          </Link>
        </div>

        {products.length === 0 ? (
          <Card shadow>
            <EmptyState
              heading="No products yet"
              body="Add your first product to start selling."
              icon={
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3ZM2 9.5a.5.5 0 0 1 .5-.5h15a.5.5 0 0 1 0 1h-15a.5.5 0 0 1-.5-.5ZM2 13.5a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1h-10a.5.5 0 0 1-.5-.5ZM2 17.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5Z" />
                </svg>
              }
            />
          </Card>
        ) : (
          <ProductGrid products={products} />
        )}
      </div>
    </div>
  );
}
