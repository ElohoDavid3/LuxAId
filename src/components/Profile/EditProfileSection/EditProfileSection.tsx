'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/Button/Button';
import styles from './EditProfileSection.module.css';

type EditProfileSectionProps = {
  userName: string;
  userEmail: string;
};

export function EditProfileSection({
  userName,
  userEmail,
}: EditProfileSectionProps) {
  const router = useRouter();
  const { update } = useSession();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(userName);
  const [email, setEmail] = useState(userEmail);
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const initials = userName
    ? userName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  function startEditing() {
    setName(userName);
    setEmail(userEmail);
    setCurrentPassword('');
    setError(null);
    setSuccess(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setName(userName);
    setEmail(userEmail);
    setCurrentPassword('');
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const emailChanged =
      trimmedEmail.toLowerCase() !== userEmail.trim().toLowerCase();

    if (trimmedName.length < 2 || trimmedName.length > 100) {
      setError('Your name must be between 2 and 100 characters.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (emailChanged && !currentPassword) {
      setError('Enter your current password to change your email.');
      return;
    }

    if (!emailChanged && trimmedName === userName) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          ...(emailChanged
            ? { email: trimmedEmail, currentPassword }
            : {}),
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!res.ok) {
        setError(data?.error ?? 'Could not save your changes. Please try again.');
        return;
      }

      await update({ name: trimmedName, email: trimmedEmail });
      setCurrentPassword('');
      setIsEditing(false);
      setSuccess('Your profile has been updated.');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  const photoRow = (
    <div className={styles.photoRow}>
      <div className={styles.avatarLarge} aria-hidden="true">
        {initials}
      </div>
      <div className={styles.photoInfo}>
        <Button variant="secondary" size="sm" disabled>
          Change photo
        </Button>
        <span className={styles.soonBadge}>Coming soon</span>
      </div>
    </div>
  );

  const headerRow = (
    <div className={styles.headerRow}>
      <h2 className={styles.sectionTitle}>Account</h2>
      {!isEditing && (
        <Button
          variant="secondary"
          size="sm"
          onClick={startEditing}
          data-testid="edit-profile-button"
        >
          Edit profile
        </Button>
      )}
    </div>
  );

  if (!isEditing) {
    return (
      <div>
        {headerRow}

        {photoRow}

        {success && (
          <p role="status" className={styles.successBox}>
            {success}
          </p>
        )}

        <div className={styles.fieldGrid}>
          <div>
            <label className={styles.label}>Name</label>
            <div className={styles.readOnly} data-testid="profile-name">
              {userName}
            </div>
          </div>
          <div>
            <label className={styles.label}>Email</label>
            <div className={styles.readOnly}>{userEmail}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {headerRow}

      {photoRow}

      {error && (
        <p role="alert" className={styles.errorBox}>
          {error}
        </p>
      )}

      <div className={styles.fieldGrid}>
        <div className={styles.field}>
          <label htmlFor="profile-name-input" className={styles.label}>
            Name
          </label>
          <input
            id="profile-name-input"
            type="text"
            name="name"
            autoComplete="name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.input}
            disabled={isSaving}
            autoFocus
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="profile-email-input" className={styles.label}>
            Email
          </label>
          <input
            id="profile-email-input"
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.input}
            disabled={isSaving}
          />
        </div>
      </div>

      {email.trim().toLowerCase() !== userEmail.trim().toLowerCase() && (
        <div className={`${styles.field} ${styles.confirmPasswordField}`}>
          <label htmlFor="profile-confirm-password" className={styles.label}>
            Current password
          </label>
          <input
            id="profile-confirm-password"
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={styles.input}
            disabled={isSaving}
          />
          <span className={styles.hint}>
            For your security, confirm your password to change your email.
          </span>
        </div>
      )}

      <div className={styles.formActions}>
        <Button type="submit" variant="primary" size="sm" isLoading={isSaving}>
          Save changes
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={cancelEditing}
          disabled={isSaving}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
