import styles from './Card.module.css';

type CardProps = {
  children: React.ReactNode;
  padded?: boolean;
  shadow?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export function Card({ children, padded = false, shadow = false, className, style }: CardProps) {
  return (
    <div
      className={[
        styles.card,
        padded ? styles.padded : '',
        shadow ? styles.shadow : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}

Card.Header = function CardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={[styles.header, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
};

Card.Title = function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className={styles.title}>{children}</h2>;
};

Card.Body = function CardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={[styles.body, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
};

Card.Footer = function CardFooter({ children }: { children: React.ReactNode }) {
  return <div className={styles.footer}>{children}</div>;
};
