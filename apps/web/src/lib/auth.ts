import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

const nextAuth = NextAuth({
  providers: [GitHub],
  pages: {
    signIn: '/',
  },
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as typeof session.user & { id: string }).id = token.sub;
      }
      return session;
    },
  },
});

export const authHandlers = nextAuth.handlers;
export const auth: typeof nextAuth.auth = nextAuth.auth;
