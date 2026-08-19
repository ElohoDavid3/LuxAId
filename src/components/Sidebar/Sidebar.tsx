'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import styles from './Sidebar.module.css';

/* ── Nav item definition ─────────────────────────────────────────── */
type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
};

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 10.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-7Zm7-8a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v15a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-15Zm7 4a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-11Z" />
      </svg>
    ),
  },
  {
    label: 'Orders',
    href: '/orders',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.414A2 2 0 0 0 15.414 6L12 2.586A2 2 0 0 0 10.586 2H6Zm5 6a1 1 0 1 0-2 0v3.586L7.707 10.293a1 1 0 1 0-1.414 1.414l3 3a1 1 0 0 0 1.414 0l3-3a1 1 0 0 0-1.414-1.414L11 11.586V8Z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  {
    label: 'Products',
    href: '/products',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 3a1 1 0 0 1 1-1h2.153a1 1 0 0 1 .986.836l.74 4.435a1 1 0 0 1-.54 1.06l-1.548.773a11.037 11.037 0 0 0 6.105 6.105l.774-1.548a1 1 0 0 1 1.059-.54l4.435.74a1 1 0 0 1 .836.986V17a1 1 0 0 1-1 1h-2C7.82 18 2 12.18 2 5V3Z" />
      </svg>
    ),
  },
  {
    label: 'Customers',
    href: '/customers',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 20 20" fill="currentColor">
        <path d="M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM17 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 0 0-1.5-4.33A5 5 0 0 1 19 16v1h-6.07ZM6 11a5 5 0 0 1 5 5v1H1v-1a5 5 0 0 1 5-5Z" />
      </svg>
    ),
  },
  {
    label: 'Conversations',
    href: '/conversations',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7l-4 4V5Z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
];

const SECONDARY_ITEMS: NavItem[] = [
  {
    label: 'Analytics',
    href: '/analytics',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5ZM8 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V7ZM14 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V4Z" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.252l1.267-1.112a7.047 7.047 0 0 1 0-2.229L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.993 6.993 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
];

/* ── Props ───────────────────────────────────────────────────────── */
type SidebarProps = {
  userName?: string;
  businessName?: string;
};

/* ── Component ───────────────────────────────────────────────────── */
export function Sidebar({ userName, businessName }: SidebarProps) {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);

  // Sync dark mode to html element
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      setIsDark(true);
    }
  }, []);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  const initials = userName
    ? userName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  return (
    <aside className={styles.sidebar}>
      {/* Brand */}
      <div className={styles.brand}>
        <svg
          className={styles.brandIcon}
          viewBox="0 0 36 36"
          fill="none"
          aria-hidden="true"
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

      {/* Business context */}
      {businessName && (
        <div className={styles.businessCtx}>
          <div className={styles.businessLabel}>Business</div>
          <div className={styles.businessName}>{businessName}</div>
        </div>
      )}

      {/* Primary nav */}
      <nav className={styles.nav} aria-label="Primary navigation">
        <div className={styles.navSection}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${isActive(item.href) ? styles.active : ''}`}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              {item.icon}
              {item.label}
              {item.badge != null && item.badge > 0 && (
                <span className={styles.badge} aria-label={`${item.badge} new`}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </Link>
          ))}
        </div>

        <div className={styles.navSection}>
          <div className={styles.navSectionLabel}>Management</div>
          {SECONDARY_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${isActive(item.href) ? styles.active : ''}`}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className={styles.footer}>
        <button
          id="theme-toggle"
          className={styles.themeToggle}
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <svg className={styles.navIcon} viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm4 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-.464 4.95.707.707a1 1 0 0 0 1.414-1.414l-.707-.707a1 1 0 0 0-1.414 1.414Zm2.12-10.607a1 1 0 0 1 0 1.414l-.706.707a1 1 0 1 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0ZM17 11a1 1 0 1 0 0-2h-1a1 1 0 1 0 0 2h1Zm-7 4a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM5.05 6.464A1 1 0 1 0 6.465 5.05l-.708-.707a1 1 0 0 0-1.414 1.414l.707.707Zm1.414 8.486-.707.707a1 1 0 0 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 1.414ZM4 11a1 1 0 1 0 0-2H3a1 1 0 1 0 0 2h1Z" />
            </svg>
          ) : (
            <svg className={styles.navIcon} viewBox="0 0 20 20" fill="currentColor">
              <path d="M17.293 13.293A8 8 0 0 1 6.707 2.707a8.001 8.001 0 1 0 10.586 10.586Z" />
            </svg>
          )}
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>

        <div className={styles.userRow}>
          <div className={styles.avatar} aria-hidden="true">{initials}</div>
          <span className={styles.userName}>{userName ?? 'User'}</span>
          <button
            id="sign-out-btn"
            className={styles.signOutBtn}
            onClick={() => signOut({ callbackUrl: '/auth/login' })}
            aria-label="Sign out"
            title="Sign out"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path
                fillRule="evenodd"
                d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z"
                clipRule="evenodd"
              />
              <path
                fillRule="evenodd"
                d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.048a.75.75 0 1 0-1.06-1.06l-2.25 2.25a.75.75 0 0 0 0 1.06l2.25 2.25a.75.75 0 1 0 1.06-1.06l-1.047-1.048H18.25A.75.75 0 0 0 19 10Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
