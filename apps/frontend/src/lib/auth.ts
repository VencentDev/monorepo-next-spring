import NextAuth from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Keycloak from 'next-auth/providers/keycloak';

const keycloakIssuer = process.env.AUTH_KEYCLOAK_ISSUER;
const keycloakClientSecret = process.env.AUTH_KEYCLOAK_SECRET;

export const protectedHomePath = '/app/todos';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID!,
      clientSecret: keycloakClientSecret,
      issuer: keycloakIssuer,
      authorization: { params: { scope: 'openid profile email' } },
      client: {
        token_endpoint_auth_method: keycloakClientSecret ? 'client_secret_basic' : 'none',
      },
      checks: ['pkce', 'state'],
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt =
          account.expires_at ?? Math.floor(Date.now() / 1000) + Number(account.expires_in ?? 0);
        token.error = undefined;
        return token;
      }

      if (!token.expiresAt || Date.now() < token.expiresAt * 1000 - 30_000) {
        return token;
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
});

async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (!keycloakIssuer || !token.refreshToken) {
    return { ...token, error: 'RefreshAccessTokenError' };
  }

  try {
    const res = await fetch(`${keycloakIssuer}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.AUTH_KEYCLOAK_ID!,
        refresh_token: token.refreshToken,
        ...(keycloakClientSecret ? { client_secret: keycloakClientSecret } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error('refresh_failed');
    }

    const refreshedToken = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    return {
      ...token,
      accessToken: refreshedToken.access_token,
      refreshToken: refreshedToken.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + refreshedToken.expires_in,
      error: undefined,
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}
