'use client';

import { useState } from 'react';
import { Button } from '@/components/Button/Button';
import styles from './ChangePasswordSection.module.css';

export function ChangePasswordSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function startChanging() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(null);
    setIsOpen(true);
  }

  function cancelChanging() {
    setIsOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match.');
      return;
    }

    if (newPassword === currentPassword) {
      setError('Your new password must be different from your current one.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!res.ok) {
        setError(data?.error ?? 'Could not change your password. Please try again.');
        return;
      }

      cancelChanging();
      setSuccess('Your password has been changed.');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <div className={styles.headerRow}>
        <h2 className={styles.sectionTitle}>Password</h2>
        {!isOpen && (
          <Button
            variant="primary"
            size="sm"
            onClick={startChanging}
            data-testid="change-password-button"
          >
            Change password
          </Button>
        )}
      </div>

      {success && (
        <p role="status" className={styles.successBox}>
          {success}
        </p>
      )}

      {!isOpen && (
        <p className={styles.sectionBody}>
          Use a strong password you have not used anywhere else.
        </p>
      )}

      {isOpen && (
        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <p role="alert" className={styles.errorBox}>
              {error}
            </p>
          )}

          <div className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="current-password" className={styles.label}>
                Current password
              </label>
              <input
                id="current-password"
                type="password"
                name="currentPassword"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={styles.input}
                disabled={isSaving}
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="new-password" className={styles.label}>
                New password
              </label>
              <input
                id="new-password"
                type="password"
                name="newPassword"
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={styles.input}
                disabled={isSaving}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="confirm-new-password" className={styles.label}>
                Confirm new password
              </label>
              <input
                id="confirm-new-password"
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="Type the new password again"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={styles.input}
                disabled={isSaving}
              />
            </div>
          </div>

          <div className={styles.formActions}>
            <Button type="submit" variant="primary" size="sm" isLoading={isSaving}>
              Save new password
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelChanging}
              disabled={isSaving}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
