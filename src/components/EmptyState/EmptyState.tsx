import styles from './EmptyState.module.css';
import { Button } from '../Button/Button';

type EmptyStateProps = {
  icon?: React.ReactNode;
  heading: string;
  body?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

export function EmptyState({ icon, heading, body, action }: EmptyStateProps) {
  return (
    <div className={styles.container} role="status" aria-live="polite">
      {icon && (
        <div className={styles.iconWrap} aria-hidden="true">
          {icon}
        </div>
      )}
      <p className={styles.heading}>{heading}</p>
      {body && <p className={styles.body}>{body}</p>}
      {action && (
        <Button variant="primary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
