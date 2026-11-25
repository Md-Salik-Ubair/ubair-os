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
     * - Static & SEO files (favicon.ico, site.webmanifest, sitemap.xml, robots.txt)
     */
    '/((?!login|api/auth|_next/static|_next/image|assets|favicon\\.ico|site\\.webmanifest|sitemap\\.xml|robots\\.txt|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp3|wav|json|webmanifest)$).*)',
  ],
};