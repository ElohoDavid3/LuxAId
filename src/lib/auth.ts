import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './prisma';
import { env } from './env';
import { logger } from './logger';
import { authorizeCredentials } from '../features/auth/credentials';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      businessId?: string;
      businessName?: string;
      twoFactorPending?: boolean;
    };
  }

  interface JWT {
    id: string;
    businessId?: string;
    businessName?: string;
    twoFactorPending?: boolean;
  }
}

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: env.NEXTAUTH_SECRET,
  trustHost: true,
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: '/auth/login',
  },
  providers: [
    Credentials({
      id: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        const email =
          typeof credentials?.email === 'string'
            ? credentials.email
            : undefined;
        const password =
          typeof credentials?.password === 'string'
            ? credentials.password
            : undefined;
        return authorizeCredentials(email, password);
      },
    }),
    Credentials({
      id: 'credentials-2fa',
      credentials: {
        userId: { label: 'User ID', type: 'text' },
      },
      authorize: async (credentials) => {
        const userId =
          typeof credentials?.userId === 'string'
            ? credentials.userId
            : undefined;
        if (!userId) return null;
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true, twoFactorEnabled: true },
        });
        if (!user || !user.twoFactorEnabled) return null;
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user, trigger, session }) => {
      if (user) {
        token.id = user.id;
        if ('twoFactorPending' in user) {
          token.twoFactorPending = user.twoFactorPending as boolean;
        }
        const membership = await prisma.businessMembership.findFirst({
          where: { userId: user.id, status: 'ACTIVE' },
          select: { businessId: true, business: { select: { name: true } } },
        });
        if (membership) {
          token.businessId = membership.businessId;
          token.businessName = membership.business.name;
        }
      }
      if (trigger === 'update') {
        const updated = session as
          | { name?: unknown; email?: unknown }
          | null
          | undefined;
        if (typeof updated?.name === 'string' && updated.name.trim()) {
          token.name = updated.name.trim();
        }
        if (typeof updated?.email === 'string' && updated.email.trim()) {
          token.email = updated.email.trim();
        }
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.businessId = token.businessId as string | undefined;
        session.user.businessName = token.businessName as string | undefined;
        session.user.twoFactorPending = token.twoFactorPending as
          | boolean
          | undefined;
      }
      return session;
    },
  },
  events: {
    signIn: ({ user }) => {
      logger.info('auth.sign_in', { userId: user.id });
    },
    signOut: (data) => {
      if ('session' in data && data.session) {
        logger.info('auth.sign_out', { userId: data.session.userId });
      }
    },
  },
});
