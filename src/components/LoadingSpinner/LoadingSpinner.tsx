import styles from './LoadingSpinner.module.css';

type LoadingSpinnerProps = {
  size?: 'sm' | 'md';
  label?: string;
};

export function LoadingSpinner({
  size = 'md',
  label = 'Loading…',
}: LoadingSpinnerProps) {
  return (
    <div
      className={`${styles.wrapper} ${size === 'sm' ? styles.sm : ''}`}
      role="status"
      aria-label={label}
    >
      <div className={styles.spinner} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
