'use client';

import { Suspense, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import styles from '../../login/page.module.css';

export default function Verify2FAWrapper() {
  return (
    <Suspense>
      <Verify2FAPage />
    </Suspense>
  );
}

function Verify2FAPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!code || code.length < 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }

    startTransition(async () => {
      try {
        const userId = sessionStorage.getItem('2fa_userId');
        if (!userId) {
          setError('Session expired. Please sign in again.');
          return;
        }

        const res = await fetch('/api/auth/2fa/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, purpose: 'login' }),
        });

        const data = (await res.json().catch(() => null)) as {
          error?: string;
          ok?: boolean;
        } | null;

        if (!res.ok) {
          setError(data?.error ?? 'Invalid code. Please try again.');
          return;
        }

        const signInResult = await signIn('credentials-2fa', {
          userId,
          redirect: false,
          callbackUrl,
        });

        sessionStorage.removeItem('2fa_userId');

        if (signInResult?.error) {
          setError('Session error. Please sign in again.');
          return;
        }

        router.push(callbackUrl);
        router.refresh();
      } catch {
        setError('Something went wrong. Please try again.');
      }
    });
  }

  return (
    <>
      <h1 className={styles.heading}>Two-factor verification</h1>
      <p className={styles.subheading}>
        Enter the 6-digit code from your authenticator app, or a backup code.
      </p>

      {error && (
        <div role="alert" className={styles.errorBox}>
          {error}
        </div>
      )}

      <form
        id="verify-2fa-form"
        className={styles.form}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className={styles.field}>
          <label htmlFor="verify-2fa-code" className={styles.label}>
            Verification code
          </label>
          <input
            id="verify-2fa-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="123456"
            maxLength={20}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={styles.input}
            disabled={isPending}
            autoFocus
          />
        </div>

        <button
          id="verify-2fa-submit"
          type="submit"
          className={styles.submitBtn}
          disabled={isPending || !code}
        >
          {isPending ? 'Verifying...' : 'Verify'}
        </button>
      </form>

      <p className={styles.footer}>
        <button
          type="button"
          className={styles.footerLink}
          onClick={() => router.push('/auth/login')}
        >
          Sign in with a different account
        </button>
      </p>
    </>
  );
}
