import styles from './Topbar.module.css';

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type TopbarProps = {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
  hasNotifications?: boolean;
};

export function Topbar({ title, breadcrumbs, hasNotifications }: TopbarProps) {
  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.label}>
                {i > 0 && <span aria-hidden="true">/</span>}
                {crumb.href ? (
                  <a href={crumb.href}>{crumb.label}</a>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>

      <div className={styles.right}>
        <button
          id="notification-btn"
          className={styles.notifBtn}
          aria-label={
            hasNotifications ? 'Notifications (new)' : 'Notifications'
          }
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            width="16"
            height="16"
            aria-hidden="true"
          >
            <path d="M10 2a6 6 0 0 0-6 6v3.586l-.707.707A1 1 0 0 0 4 14h12a1 1 0 0 0 .707-1.707L16 11.586V8a6 6 0 0 0-6-6ZM10 18a3 3 0 0 1-3-3h6a3 3 0 0 1-3 3Z" />
          </svg>
          {hasNotifications && (
            <span className={styles.notifDot} aria-hidden="true" />
          )}
        </button>
      </div>
    </header>
  );
}
