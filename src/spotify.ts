import { getAuthUrl, exchangeToken, refreshToken } from './spotify_auth_pkce.ts';

export class SpotifyAPI {
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private tokenExpiresAt: number = 0;

    constructor() {
        //this.clearTokens();

        // Initialize tokens from localStorage
        const storedAccessToken = localStorage.getItem('spotify_access_token');
        const storedRefreshToken = localStorage.getItem('spotify_refresh_token');
        const storedExpiresAt = localStorage.getItem('spotify_token_expires_at');

        if (storedAccessToken && storedRefreshToken && storedExpiresAt) {
            this.accessToken = storedAccessToken;
            this.refreshToken = storedRefreshToken;
            this.tokenExpiresAt = parseInt(storedExpiresAt, 10);
        }
    }

    async ensureAuthorization(scopes: string[]): Promise<void> {
        if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
            const currentUrl = new URL(globalThis.location.href);
            const code = currentUrl.searchParams.get('code');

            if (!code && !this.refreshToken) {
                // Redirect to Spotify authorization URL if no tokens are available
                const authorizationUrl = getAuthUrl(scopes);
                globalThis.location.href = authorizationUrl;
            } else if (code) {
                // Exchange the authorization code for tokens
                const tokenResponse = await exchangeToken(code);
                this.saveTokens(tokenResponse);
                this.updateUIState(true);

                // Clean up the URL
                currentUrl.searchParams.delete('code');
                globalThis.history.replaceState({}, '', currentUrl.toString());
            } else if (this.refreshToken) {
                // Refresh the token if the access token is expired
                await this.refreshAccessToken();
            }
        }
    }

    async refreshAccessToken(): Promise<void> {
        if (!this.refreshToken) {
            throw new Error('No refresh token available.');
        }

        const tokenResponse = await refreshToken(this.refreshToken);
        this.saveTokens(tokenResponse);
    }

    // Save tokens to localStorage and update internal state
    private saveTokens(tokenResponse: { access_token: string; refresh_token?: string; expires_in: number }): void {
        this.accessToken = tokenResponse.access_token;
        this.refreshToken = tokenResponse.refresh_token || this.refreshToken; // Refresh token may not always be returned
        this.tokenExpiresAt = Date.now() + tokenResponse.expires_in * 1000;

        localStorage.setItem('spotify_access_token', this.accessToken);
        if (this.refreshToken) {
            localStorage.setItem('spotify_refresh_token', this.refreshToken);
        }
        localStorage.setItem('spotify_token_expires_at', this.tokenExpiresAt.toString());
    }

    // Clear tokens from localStorage and reset internal state
    private clearTokens(): void {
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiresAt = 0;

        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_token_expires_at');
    }

    // Ensure API requests check for and initialize tokens
    // deno-lint-ignore no-explicit-any
    async requestAPI(endpoint: string, method: string = 'GET', body: any = null): Promise<any> {
        await this.ensureAuthorization([]);

        const headers = new Headers({
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
        });

        const response = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const errorData = await response.json();
            if (response.status === 401) {
                // Access token might be expired, refresh and retry
                console.warn('Access token expired. Attempting to refresh...');
                await this.refreshAccessToken();
                return this.requestAPI(endpoint, method, body);
            }
            throw new Error(`Spotify API Error: ${errorData.error.message}`);
        }

        return await response.json();
    }

    async play(): Promise<void> {
        await this.requestAPI('me/player/play', 'PUT');
    }

    async pause(): Promise<void> {
        await this.requestAPI('me/player/pause', 'PUT');
    }

    // deno-lint-ignore no-explicit-any
    async getPlaybackState(): Promise<any> {
        return await this.requestAPI('me/player', 'GET');
    }

    private updateUIState(enabled: boolean): void {
        (document.getElementById('play') as HTMLButtonElement)!.disabled = !enabled;
        (document.getElementById('pause') as HTMLButtonElement)!.disabled = !enabled;
    }
}




// Initialize Spotify API
const spotify = new SpotifyAPI();

// Add button event listeners
document.getElementById('load')?.addEventListener('click', async () => {
    await spotify.ensureAuthorization(['user-read-playback-state', 'user-modify-playback-state']);
    console.log('API Loaded.');
});

document.getElementById('play')?.addEventListener('click', async () => {
    await spotify.play();
    console.log('Playback started.');
});

document.getElementById('pause')?.addEventListener('click', async () => {
    await spotify.pause();
    console.log('Playback paused.');
});




let album_art_visible = false;

document.getElementById('album_art')?.addEventListener('click', async () => {
    const playbackState = await spotify.getPlaybackState();
    const albumArtUrl = playbackState?.item?.album?.images[0]?.url;

    const display_div = document.getElementById('displays') as HTMLDivElement;
    //invert the visibility of div
    album_art_visible = !album_art_visible;

    if (albumArtUrl) {
        if (!album_art_visible) {
            const imgElement = document.getElementById('album_art_display') as HTMLImageElement;
            imgElement.src = albumArtUrl;
            imgElement.width = 512;
            imgElement.height = 512;
        }
    }
    display_div.style.display = album_art_visible ? 'block' : 'none';

});