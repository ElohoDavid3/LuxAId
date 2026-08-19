'use client';

import { Suspense, useState, useTransition } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '../../login/page.module.css';

type Mode = 'signin' | 'signup';

export default function AuthPageWrapper() {
  return (
    <Suspense>
      <AuthPage />
    </Suspense>
  );
}

function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetFields() {
    setName('');
    setEmail('');
    setPassword('');
    setBusinessName('');
    setError(null);
    setSuccess(null);
  }

  function switchMode(next: Mode) {
    resetFields();
    setMode(next);
  }

  function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setError('Incorrect email or password. Please try again.');
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    });
  }

  function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, businessName }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? 'Signup failed. Please try again.');
          return;
        }

        const signInResult = await signIn('credentials', {
          email,
          password,
          redirect: false,
          callbackUrl,
        });

        if (signInResult?.error) {
          setSuccess('Account created! Please sign in with your credentials.');
          switchMode('signin');
          setEmail(email);
        } else {
          router.push(callbackUrl);
          router.refresh();
        }
      } catch {
        setError('Something went wrong. Please try again.');
      }
    });
  }

  const isSignIn = mode === 'signin';

  return (
    <>
      <h1 className={styles.heading}>
        {isSignIn ? 'Welcome back' : 'Create your account'}
      </h1>
      <p className={styles.subheading}>
        {isSignIn
          ? 'Sign in to your merchant dashboard.'
          : 'Set up your business and start selling.'}
      </p>

      {error && (
        <div role="alert" className={styles.errorBox}>
          {error}
        </div>
      )}

      {success && (
        <div role="status" className={styles.successBox}>
          {success}
        </div>
      )}

      {isSignIn ? (
        <form
          id="signin-form"
          className={styles.form}
          onSubmit={handleSignIn}
          noValidate
        >
          <div className={styles.field}>
            <label htmlFor="signin-email" className={styles.label}>
              Email address
            </label>
            <input
              id="signin-email"
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="you@business.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              disabled={isPending}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="signin-password" className={styles.label}>
              Password
            </label>
            <input
              id="signin-password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              disabled={isPending}
            />
          </div>

          <button
            id="signin-submit"
            type="submit"
            className={styles.submitBtn}
            disabled={isPending || !email || !password}
          >
            {isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      ) : (
        <form
          id="signup-form"
          className={styles.form}
          onSubmit={handleSignUp}
          noValidate
        >
          <div className={styles.field}>
            <label htmlFor="signup-name" className={styles.label}>
              Full name
            </label>
            <input
              id="signup-name"
              type="text"
              name="name"
              autoComplete="name"
              required
              placeholder="Adaeze Okafor"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={styles.input}
              disabled={isPending}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="signup-business" className={styles.label}>
              Business name
            </label>
            <input
              id="signup-business"
              type="text"
              name="businessName"
              autoComplete="organization"
              required
              placeholder="Adaeze Fashion Store"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className={styles.input}
              disabled={isPending}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="signup-email" className={styles.label}>
              Email address
            </label>
            <input
              id="signup-email"
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="you@business.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              disabled={isPending}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="signup-password" className={styles.label}>
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              disabled={isPending}
            />
          </div>

          <button
            id="signup-submit"
            type="submit"
            className={styles.submitBtn}
            disabled={isPending || !name || !businessName || !email || !password}
          >
            {isPending ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      )}

      <p className={styles.footer}>
        {isSignIn ? (
          <>
            New here?{' '}
            <button
              type="button"
              className={styles.footerLink}
              onClick={() => switchMode('signup')}
            >
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button
              type="button"
              className={styles.footerLink}
              onClick={() => switchMode('signin')}
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </>
  );
}
