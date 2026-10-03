import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/login',
  },
});

export const config = {
  matcher: [
    /*
     * Match all application routes except:
     * - /login (Auth gateway)
     * - /api/auth (NextAuth API routes)
     * - /_next/static (Static chunks)
     * - /_next/image (Image optimization)
     * - /assets (Brand assets, logos, wordmarks)
     * - Static asset file extensions (*.png, *.svg, *.ico, etc.)
     */
    '/((?!login|api/auth|_next/static|_next/image|assets|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp3|wav|json)$).*)',
  ],
};