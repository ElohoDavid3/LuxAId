'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/Button/Button';
import styles from './TwoFactorAuth.module.css';

type View = 'idle' | 'setup' | 'verify-setup' | 'enabled' | 'disable';

interface Props {
  initialEnabled: boolean;
}

export function TwoFactorAuth({ initialEnabled }: Props) {
  const [view, setView] = useState<View>(initialEnabled ? 'enabled' : 'idle');
  const [secret, setSecret] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/2fa/status');
      if (res.ok) {
        const data = (await res.json()) as { enabled: boolean };
        setView(data.enabled ? 'enabled' : 'idle');
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function startSetup() {
    setError(null);
    setCode('');
    setIsSaving(true);
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string };
        setError(data?.error ?? 'Could not start setup. Please try again.');
        return;
      }
      const data = (await res.json()) as {
        otpauthUri: string;
        secret: string;
      };
      setOtpauthUri(data.otpauthUri);
      setSecret(data.secret);
      setManualKey(data.secret);
      setView('setup');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleVerifySetup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!code || code.length < 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, secret }),
      });

      const data = (await res.json().catch(() => null)) as {
        error?: string;
        backupCodes?: string[];
      } | null;

      if (!res.ok) {
        setError(data?.error ?? 'Invalid code. Please try again.');
        return;
      }

      setBackupCodes(data?.backupCodes ?? []);
      setShowBackupCodes(true);
      setView('enabled');
      setCode('');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDisable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!disablePassword) {
      setError('Enter your current password.');
      return;
    }
    if (!disableCode || disableCode.length < 6) {
      setError('Enter the 6-digit verification code.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: disableCode,
          currentPassword: disablePassword,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!res.ok) {
        setError(data?.error ?? 'Could not disable 2FA. Please try again.');
        return;
      }

      setView('idle');
      setDisablePassword('');
      setDisableCode('');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      {error && (
        <p role="alert" className={styles.errorBox}>
          {error}
        </p>
      )}

      {showBackupCodes && backupCodes.length > 0 && (
        <div className={styles.backupCodesBox}>
          <p className={styles.backupCodesTitle}>Save your backup codes</p>
          <p className={styles.backupCodesDesc}>
            Store these codes somewhere safe. Each code can be used once if you
            lose access to your authenticator app.
          </p>
          <div className={styles.codeGrid}>
            {backupCodes.map((c) => (
              <code key={c} className={styles.backupCode}>
                {c}
              </code>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowBackupCodes(false)}
          >
            I have saved these codes
          </Button>
        </div>
      )}

      {view === 'idle' && !showBackupCodes && (
        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <div className={styles.rowName}>Two-factor authentication</div>
            <div className={styles.rowDesc}>
              Add an extra code at sign-in to protect your account.
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={startSetup}
            isLoading={isSaving}
          >
            Enable
          </Button>
        </div>
      )}

      {view === 'setup' && (
        <div className={styles.setupSection}>
          <p className={styles.setupDesc}>
            Scan this QR code with your authenticator app (Google Authenticator,
            Authy, etc.), then enter the 6-digit code to verify.
          </p>
          <div className={styles.qrPlaceholder}>
            <a
              href={otpauthUri}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.qrLink}
            >
              Click here to set up key in your authenticator app
            </a>
          </div>
          <div className={styles.manualKeySection}>
            <span className={styles.manualKeyLabel}>Manual entry key:</span>
            <code className={styles.manualKey}>{manualKey}</code>
          </div>
          <form onSubmit={handleVerifySetup} className={styles.verifyForm}>
            <div className={styles.field}>
              <label htmlFor="2fa-setup-code" className={styles.label}>
                Verification code
              </label>
              <input
                id="2fa-setup-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={styles.input}
                disabled={isSaving}
                autoFocus
              />
            </div>
            <div className={styles.formActions}>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isSaving}
              >
                Verify and enable
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setView('idle');
                  setCode('');
                  setError(null);
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {view === 'enabled' && !showBackupCodes && (
        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <div className={styles.rowName}>Two-factor authentication</div>
            <div className={styles.rowDesc}>
              Your account is protected with an authenticator app.
            </div>
          </div>
          <div className={styles.enabledActions}>
            <span className={styles.enabledBadge}>Enabled</span>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setView('disable');
                setDisablePassword('');
                setDisableCode('');
                setError(null);
              }}
            >
              Disable
            </Button>
          </div>
        </div>
      )}

      {view === 'disable' && (
        <div className={styles.setupSection}>
          <p className={styles.setupDesc}>
            Enter your password and a verification code to disable two-factor
            authentication.
          </p>
          <form onSubmit={handleDisable} className={styles.verifyForm}>
            <div className={styles.field}>
              <label htmlFor="disable-password" className={styles.label}>
                Current password
              </label>
              <input
                id="disable-password"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className={styles.input}
                disabled={isSaving}
                autoFocus
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="disable-code" className={styles.label}>
                Verification code
              </label>
              <input
                id="disable-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                value={disableCode}
                onChange={(e) =>
                  setDisableCode(e.target.value.replace(/\D/g, ''))
                }
                className={styles.input}
                disabled={isSaving}
              />
            </div>
            <div className={styles.formActions}>
              <Button
                type="submit"
                variant="danger"
                size="sm"
                isLoading={isSaving}
              >
                Disable 2FA
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setView('enabled');
                  setDisablePassword('');
                  setDisableCode('');
                  setError(null);
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
