import styles from './layout.module.css';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.page}>
      {/* Brandmark */}
      <div className={styles.brandmark}>
        <svg
          viewBox="0 0 36 36"
          fill="none"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="36" height="36" rx="10" fill="currentColor" />
          <path
            d="M10 22L18 10l8 12"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="18" cy="25" r="2.5" fill="white" />
        </svg>
        <span className={styles.brandName}>OrderAId</span>
      </div>
      {/* Auth card */}
      <div className={styles.card}>{children}</div>
    </div>
  );
}
