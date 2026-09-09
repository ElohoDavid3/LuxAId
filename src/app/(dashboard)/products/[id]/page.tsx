import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireDashboardSession } from '@/lib/session';
import { Card } from '@/components/Card/Card';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { ProductEditForm } from './ProductEditForm';

export const metadata: Metadata = { title: 'Edit Product' };
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireDashboardSession();
  const { id } = await params;

  const product = await prisma.product.findFirst({
    where: { id, businessId: session.businessId },
    include: {
      variants: {
        include: { inventory: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!product) notFound();

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Link href="/products" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
          &larr; Back to Products
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Left: Product details form */}
        <Card shadow padded>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Edit Product</h2>
            <StatusBadge status={product.status} />
          </div>
          <ProductEditForm product={product} />
        </Card>

        {/* Right: Variants and inventory info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <Card shadow padded>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Variants & Inventory</h3>
            {product.variants.length === 0 ? (
              <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>No variants created.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {product.variants.map((variant) => (
                  <div key={variant.id} style={{ padding: '0.75rem', border: '1px solid var(--color-outline-variant)', borderRadius: '6px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{variant.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
                      SKU: {variant.sku}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.875rem' }}>
                      <span>Available: <strong>{variant.inventory?.available ?? 0}</strong></span>
                      <span>Reserved: {variant.inventory?.reserved ?? 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
