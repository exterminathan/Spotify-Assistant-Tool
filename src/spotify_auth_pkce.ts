// spotify_auth_pkce.ts
import { secrets } from "../secrets.ts";

// Utility to get the correct redirect URI based on the environment
const getRedirectURI = () => {
    const currentHost = globalThis.location.origin;
    if (currentHost.includes('localhost') || currentHost.includes('127.0.0.1')) {
        return secrets.redirectUri.dev;
    }
    return secrets.redirectUri.prod;
};

// Utility to generate a random string
const generateRandomString = (length: number) => {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, value) => acc + charset[value % charset.length], '');
};

// Generate or retrieve the code verifier
const getCodeVerifier = () => {
    let codeVerifier = sessionStorage.getItem('code_verifier');
    if (!codeVerifier) {
        codeVerifier = generateRandomString(64);
        sessionStorage.setItem('code_verifier', codeVerifier);
    }
    return codeVerifier;
};

// SHA-256 hashing function
// deno-lint-ignore require-await
const sha256 = async (plain: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return globalThis.crypto.subtle.digest('SHA-256', data);
};

// Base64 URL encoding
const base64encode = (input: ArrayBuffer) => {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
};

// Generate the Auth URL
export const getAuthUrl = (scopes: string[]) => {
    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('client_id', secrets.clientId);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', getRedirectURI());
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('scope', scopes.join(' '));

    return authUrl.toString();
};

// Get code verificaiton and exchange for token
// deno-lint-ignore no-explicit-any
export const exchangeToken = async (code: string): Promise<any> => {
    const tokenUrl = 'https://accounts.spotify.com/api/token';

    const codeVerifier = sessionStorage.getItem('code_verifier');
    if (!codeVerifier) {
        throw new Error('Code verifier not found in sessionStorage.');
    }

    const body = new URLSearchParams({
        client_id: secrets.clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: getRedirectURI(),
        code_verifier: codeVerifier,
    });

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error('Error exchanging code for tokens:', errorData);
        throw new Error(`Failed to exchange token: ${errorData.error_description}`);
    }

    const tokenData = await response.json();

    // Remove code_verifier from sessionStorage after successful exchange
    sessionStorage.removeItem('code_verifier');

    return tokenData;
};

// Refresh access token
// deno-lint-ignore no-explicit-any
export const refreshToken = async (refreshToken: string): Promise<any> => {
    const tokenUrl = 'https://accounts.spotify.com/api/token';
    const body = new URLSearchParams({
        client_id: secrets.clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    });

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error('Error refreshing token:', errorData);
        throw new Error(`Failed to refresh token: ${errorData.error_description}`);
    }

    return await response.json();
};


// Spotify Authentication with PKCE
let codeChallenge: string;

(async () => {
    const codeVerifier = getCodeVerifier();
    codeChallenge = base64encode(await sha256(codeVerifier));
})();

