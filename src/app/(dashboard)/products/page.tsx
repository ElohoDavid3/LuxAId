import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/session';
import { Topbar } from '@/components/Topbar/Topbar';
import { Card } from '@/components/Card/Card';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { Button } from '@/components/Button/Button';
import { EmptyState } from '@/components/EmptyState/EmptyState';

export const metadata: Metadata = { title: 'Products' };

async function getProducts(businessId: string) {
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
    price: p.price,
    status: p.status,
    variantCount: p.variants.length,
    totalStock: p.variants.reduce((sum, v) => sum + (v.inventory?.available ?? 0), 0),
  }));
}

function formatNaira(kobo: number) {
  return '\u20A6' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 });
}

function stockStatus(total: number): string {
  if (total === 0) return 'OUT_OF_STOCK';
  if (total <= 5) return 'LOW_STOCK';
  return 'active';
}

export default async function ProductsPage() {
  const session = await requireDashboardSession();
  const products = await getProducts(session.businessId);

  return (
    <div>
      <Topbar title="Products" />
      <div style={{ padding: '1.5rem 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
          <Button variant="primary" leftIcon={<span aria-hidden>+</span>} disabled>
            Add product
          </Button>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {products.map((product) => {
              const stock = stockStatus(product.totalStock);
              return (
                <Card key={product.id} shadow style={{ height: '100%', transition: 'transform 0.15s ease' }}>
                  <Card.Header>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                      <Card.Title>{product.name}</Card.Title>
                      <StatusBadge status={product.status} />
                    </div>
                  </Card.Header>
                  <Card.Body>
                    <p style={{ fontSize: 'var(--type-dr-body-small-font-size)', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                      {product.description || 'No description'}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 'var(--type-dr-title-medium-font-size)', color: 'var(--color-primary)' }}>
                        {formatNaira(product.price)}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <StatusBadge status={stock} />
                        <span style={{ fontSize: 'var(--type-dr-body-small-font-size)', color: 'var(--color-on-surface-variant)' }}>
                          {product.totalStock} in stock
                        </span>
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
