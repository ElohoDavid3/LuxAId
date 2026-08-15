import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './prisma';
import { env } from './env';
import { logger } from './logger';
import { authorizeCredentials } from '../features/auth/credentials';

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: env.NEXTAUTH_SECRET,
  trustHost: true,
  session: {
    strategy: 'database',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: '/auth/login',
  },
  providers: [
    Credentials({
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
  ],
  callbacks: {
    session: ({ session, user }) => {
      if (session.user && user && user.id) {
        session.user.id = user.id;
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
