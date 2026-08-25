import type { Metadata } from 'next';
import Link from 'next/link';
import { requireDashboardSession } from '@/lib/session';
import { Card } from '@/components/Card/Card';
import { AddProductForm } from '@/components/Products/AddProductForm/AddProductForm';

export const metadata: Metadata = { title: 'Add product' };

export default async function NewProductPage() {
  await requireDashboardSession();

  return (
    <div>
      <div style={{ padding: '1.5rem 2rem', maxWidth: '640px' }}>
        <div style={{ marginBottom: '1rem' }}>
          <Link
            href="/products"
            style={{
              color: 'var(--color-primary)',
              fontSize: 'var(--type-dr-body-small-font-size)',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            &larr; Back to products
          </Link>
        </div>

        <h1
          style={{
            fontFamily: 'var(--type-dr-headline-small-font-family)',
            fontSize: 'var(--type-dr-headline-small-font-size)',
            fontWeight: 'var(--type-dr-headline-small-font-weight)',
            color: 'var(--color-on-surface)',
            margin: '0 0 0.375rem',
          }}
        >
          Add product
        </h1>
        <p
          style={{
            fontFamily: 'var(--type-dr-body-medium-font-family)',
            fontSize: 'var(--type-dr-body-medium-font-size)',
            color: 'var(--color-on-surface-variant)',
            marginBottom: '1.5rem',
          }}
        >
          Share what you sell so customers can find it and place orders.
        </p>

        <Card shadow padded>
          <AddProductForm />
        </Card>
      </div>
    </div>
  );
}
