import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const runtime = 'nodejs';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 Days Persistent Session
  },
  events: {
    async signIn({ account, user }) {
      if (account?.provider === 'google' && user.email) {
        const cleanEmail = user.email.trim().toLowerCase();
        const userName = user.name || 'User';
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

        // Synchronize Profile with Backend Engine (Zero-Delay Telemetry Sync)
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);

          await fetch(`${backendUrl}/api/user/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              user_id: cleanEmail,
              email: cleanEmail,
              name: userName,
              trigger_welcome: true
            }),
          });

          clearTimeout(timeoutId);
        } catch (syncErr) {
          console.warn('Backend authentication sync standby:', syncErr);
        }
      }
    },
  },
  callbacks: {
    async jwt({ token, user, profile }: any) {
      if (profile?.picture) token.picture = profile.picture;
      if (user) {
        token.id = user.id;
        token.email = user.email?.trim().toLowerCase();
        token.name = user.name;
        if (user.image) token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.id = token.id;
        session.user.email = token.email;
        session.user.name = token.name;
        session.user.image = token.picture || session.user.image;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };