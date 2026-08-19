import styles from './StatusBadge.module.css';

type StatusVariant = 'success' | 'error' | 'pending' | 'secondary' | 'info';

/* Maps domain status strings to a visual variant */
function resolveVariant(status: string): StatusVariant {
  const s = status.toUpperCase();
  if (['PAID', 'SUCCESSFUL', 'DELIVERED', 'ACTIVE', 'RESOLVED'].includes(s))
    return 'success';
  if (['FAILED', 'CANCELLED', 'REJECTED', 'OVERDUE'].includes(s))
    return 'error';
  if (['REFUNDED', 'RETURNED'].includes(s)) return 'secondary';
  if (['PROCESSING', 'SHIPPED', 'READY_FOR_DELIVERY', 'AI'].includes(s))
    return 'info';
  // PENDING, AWAITING_PAYMENT, DRAFT, HUMAN, OPEN, LOW_STOCK, etc.
  return 'pending';
}

/* Human-friendly label overrides */
const LABEL_MAP: Record<string, string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  READY_FOR_DELIVERY: 'Ready to ship',
  LOW_STOCK: 'Low stock',
  OUT_OF_STOCK: 'Out of stock',
  AI: 'AI handling',
  HUMAN: 'Human takeover',
};

type StatusBadgeProps = {
  status: string;
  /** Override the display label; defaults to a formatted version of status */
  label?: string;
  showDot?: boolean;
};

export function StatusBadge({ status, label, showDot = true }: StatusBadgeProps) {
  const variant = resolveVariant(status);
  const displayLabel =
    label ??
    LABEL_MAP[status.toUpperCase()] ??
    status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace(/_/g, ' ');

  return (
    <span className={`${styles.badge} ${styles[variant]}`} role="status">
      {showDot && <span className={styles.dot} aria-hidden="true" />}
      {displayLabel}
    </span>
  );
}
