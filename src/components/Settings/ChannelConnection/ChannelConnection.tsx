'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button/Button';
import styles from './ChannelConnection.module.css';

export interface ChannelConnectionInitial {
  connected: boolean;
  displayLabel?: string;
}

type ChannelConnectionProps = {
  endpoint: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  initial: ChannelConnectionInitial;
  idFieldName: string;
  idFieldLabel: string;
  idFieldPlaceholder?: string;
  optionalFieldName?: string;
  optionalFieldLabel?: string;
};

export function ChannelConnection({
  endpoint,
  name,
  description,
  icon,
  initial,
  idFieldName,
  idFieldLabel,
  idFieldPlaceholder,
  optionalFieldName,
  optionalFieldLabel,
}: ChannelConnectionProps) {
  const router = useRouter();
  const [connected, setConnected] = useState(initial.connected);
  const [displayLabel, setDisplayLabel] = useState(
    initial.displayLabel ?? '',
  );
  const [formOpen, setFormOpen] = useState(false);
  const [accountFieldValue, setAccountFieldValue] = useState('');
  const [tokenFieldValue, setTokenFieldValue] = useState('');
  const [optionalFieldValue, setOptionalFieldValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleConnect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!accountFieldValue.trim()) {
      setError(`Please enter your ${idFieldLabel.toLowerCase()}.`);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [idFieldName]: accountFieldValue.trim(),
          ...(tokenFieldValue.trim() ? { accessToken: tokenFieldValue.trim() } : {}),
          ...(optionalFieldName && optionalFieldValue.trim()
            ? { [optionalFieldName]: optionalFieldValue.trim() }
            : {}),
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        error?: string;
        displayPhoneNumber?: string;
        username?: string;
        pageName?: string;
      } | null;

      if (!res.ok) {
        setError(data?.error ?? `Could not connect ${name}. Please try again.`);
        return;
      }

      setConnected(true);
      setDisplayLabel(
        data?.displayPhoneNumber ?? data?.username ?? data?.pageName ?? '',
      );
      closeForm();
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDisconnect() {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ?? `Could not disconnect ${name}. Please try again.`,
        );
        return;
      }
      setConnected(false);
      setDisplayLabel('');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  function closeForm() {
    setFormOpen(false);
    setAccountFieldValue('');
    setTokenFieldValue('');
    setOptionalFieldValue('');
    setError(null);
  }

  return (
    <div className={styles.block}>
      <div className={styles.header}>
        <div className={styles.rowIcon} aria-hidden="true">
          {icon}
        </div>
        <div className={styles.info}>
          <div className={styles.name}>{name}</div>
          <p className={styles.desc}>{description}</p>
          {connected && displayLabel && (
            <p className={styles.number}>{displayLabel}</p>
          )}
        </div>
        {connected ? (
          <div className={styles.actions}>
            <span className={styles.connectedBadge}>Connected</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              disabled={isSaving}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setFormOpen((open) => !open)}
            disabled={isSaving}
          >
            Connect
          </Button>
        )}
      </div>

      {!connected && formOpen && (
        <form className={styles.form} onSubmit={handleConnect}>
          {error && (
            <div role="alert" className={styles.errorBox}>
              {error}
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor={`${name.toLowerCase()}-${idFieldName}`} className={styles.label}>
              {idFieldLabel}
            </label>
            <input
              id={`${name.toLowerCase()}-${idFieldName}`}
              type="text"
              placeholder={idFieldPlaceholder}
              value={accountFieldValue}
              onChange={(e) => setAccountFieldValue(e.target.value)}
              className={styles.input}
              disabled={isSaving}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor={`${name.toLowerCase()}-access-token`} className={styles.label}>
              Access token
            </label>
            <input
              id={`${name.toLowerCase()}-access-token`}
              type="password"
              autoComplete="off"
              placeholder="Leave blank to use the OrderAId system token"
              value={tokenFieldValue}
              onChange={(e) => setTokenFieldValue(e.target.value)}
              className={styles.input}
              disabled={isSaving}
            />
            <span className={styles.hint}>
              Stored securely and never shown again.
            </span>
          </div>

          {optionalFieldName && optionalFieldLabel && (
            <div className={styles.field}>
              <label
                htmlFor={`${name.toLowerCase()}-${optionalFieldName}`}
                className={styles.label}
              >
                {optionalFieldLabel}
              </label>
              <input
                id={`${name.toLowerCase()}-${optionalFieldName}`}
                type="text"
                value={optionalFieldValue}
                onChange={(e) => setOptionalFieldValue(e.target.value)}
                className={styles.input}
                disabled={isSaving}
              />
            </div>
          )}

          <div className={styles.formActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={closeForm}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSaving}>
              Save connection
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
