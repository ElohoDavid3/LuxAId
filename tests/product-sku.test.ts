import { generateSku } from '../src/features/products/sku';

describe('generateSku', () => {
  it('produces a prefix derived from the product name plus a random suffix', () => {
    const sku = generateSku('Ankara Gown');
    expect(sku).toMatch(/^ANK-[A-Z0-9]{6}$/);
  });

  it('uses at most three alphanumeric characters as the prefix', () => {
    expect(generateSku('Hand-Woven Aso Oke Fabric!')).toMatch(
      /^HAN-[A-Z0-9]{6}$/,
    );
  });

  it('falls back to PRD when the name has no alphanumeric characters', () => {
    expect(generateSku('*** --- ***')).toMatch(/^PRD-[A-Z0-9]{6}$/);
    expect(generateSku('')).toMatch(/^PRD-[A-Z0-9]{6}$/);
  });

  it('generates different SKUs across calls', () => {
    const skus = new Set(Array.from({ length: 50 }, () => generateSku('Test')));
    expect(skus.size).toBe(50);
  });
});
