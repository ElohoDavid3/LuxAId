const SKU_PREFIX_MAX_LENGTH = 3;
const SKU_SUFFIX_LENGTH = 6;
const SKU_FALLBACK_PREFIX = 'PRD';
const BASE36 = 36;

function derivePrefix(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return letters.slice(0, SKU_PREFIX_MAX_LENGTH) || SKU_FALLBACK_PREFIX;
}

function randomSuffix(): string {
  let suffix = '';
  for (let i = 0; i < SKU_SUFFIX_LENGTH; i += 1) {
    suffix += Math.floor(Math.random() * BASE36).toString(BASE36);
  }
  return suffix.toUpperCase();
}

export function generateSku(name: string): string {
  return `${derivePrefix(name)}-${randomSuffix()}`;
}
