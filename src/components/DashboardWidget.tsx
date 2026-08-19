import React from 'react';
import styles from './DashboardWidget.module.css';

type TrendDirection = 'up' | 'down' | 'neutral';

type DashboardWidgetProps = {
  /** Card label/title */
  title: string;
  /** Primary value displayed prominently */
  value: React.ReactNode;
  /** Optional small text below the value */
  caption?: string;
  /** Optional icon shown in the top-right of the card */
  icon?: React.ReactNode;
  /** Optional trend delta, e.g. "+12%" or "-3" */
  trend?: {
    label: string;
    direction: TrendDirection;
  };
  /** Highlight this widget with primary-container styling + pulse animation */
  highlight?: boolean;
};

export const DashboardWidget: React.FC<DashboardWidgetProps> = ({
  title,
  value,
  caption,
  icon,
  trend,
  highlight = false,
}) => {
  const trendClass =
    trend?.direction === 'up'
      ? styles.trendUp
      : trend?.direction === 'down'
        ? styles.trendDown
        : styles.trendNeutral;

  return (
    <div
      className={[
        styles.widget,
        highlight ? styles.highlight : '',
        highlight ? styles.pulse : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Icon row (shown only when icon is provided) */}
      {icon && (
        <div className={styles.iconRow}>
          <div className={styles.icon} aria-hidden="true">
            {icon}
          </div>
          {trend && (
            <span className={`${styles.trend} ${trendClass}`}>
              {trend.direction === 'up' && '↑ '}
              {trend.direction === 'down' && '↓ '}
              {trend.label}
            </span>
          )}
        </div>
      )}

      {/* Title */}
      <h3 className={styles.title}>{title}</h3>

      {/* Value */}
      <div className={styles.value}>{value}</div>

      {/* Caption + trend (when no icon) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {caption && <span className={styles.caption}>{caption}</span>}
        {!icon && trend && (
          <span className={`${styles.trend} ${trendClass}`}>
            {trend.direction === 'up' && '↑ '}
            {trend.direction === 'down' && '↓ '}
            {trend.label}
          </span>
        )}
      </div>
    </div>
  );
};
