import styles from './ProductCard.module.css';

export type ProductTagTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

export interface ProductTag {
  label: string;
  tone?: ProductTagTone;
}

type ProductCardProps = {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  category?: string | null;
  priceLabel: string;
  tags?: ProductTag[];
  /** Rendered at the card's top-right corner, over the image area */
  topRightAction?: React.ReactNode;
  /** Optional row rendered at the bottom of the card (e.g. manage actions) */
  actions?: React.ReactNode;
};

const IMAGE_FALLBACK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect
      x="3"
      y="4"
      width="18"
      height="16"
      rx="3"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <circle cx="9" cy="10" r="1.75" fill="currentColor" />
    <path
      d="M4 17.5L9.5 12.5L13 15.5L16.5 12.5L20 16"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function ProductCard({
  name,
  description,
  imageUrl,
  category,
  priceLabel,
  tags = [],
  topRightAction,
  actions,
}: ProductCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.media}>
        {imageUrl ? (
          // Merchant-provided image URLs can point to any host, so the
          // Next.js Image optimizer's allow-list does not apply here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={name}
            loading="lazy"
            className={styles.image}
          />
        ) : (
          <div className={styles.imageFallback} aria-hidden="true">
            {IMAGE_FALLBACK_ICON}
          </div>
        )}
        {topRightAction && (
          <div className={styles.topRightAction}>{topRightAction}</div>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <h2 className={styles.name}>{name}</h2>
          <span className={styles.pricePill}>{priceLabel}</span>
        </div>

        {description && <p className={styles.description}>{description}</p>}

        {(category || tags.length > 0) && (
          <ul className={styles.tagRow} aria-label="Product tags">
            {category && (
              <li className={`${styles.tag} ${styles.neutral}`}>{category}</li>
            )}
            {tags.map((tag) => (
              <li
                key={tag.label}
                className={`${styles.tag} ${styles[tag.tone ?? 'neutral']}`}
              >
                {tag.label}
              </li>
            ))}
          </ul>
        )}

        {actions && <div className={styles.actionRow}>{actions}</div>}
      </div>
    </article>
  );
}
