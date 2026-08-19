import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'OrderAId — AI Sales & Support for Your Business',
    template: '%s | OrderAId',
  },
  description:
    'OrderAId helps Nigerian social-commerce merchants turn customer conversations into verified commerce outcomes — from product discovery to payment and fulfilment.',
  metadataBase: new URL(
    process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  ),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
