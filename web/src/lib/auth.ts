// Auth configuration and utilities
// Mirrors the CLI auth.ts but adapted for browser/Next.js

export const AUTH_CONFIG = {
    CLIENT_ID: process.env.NEXT_PUBLIC_CLIENT_ID || "app_EMoamEEZ73f0CkXaXp7hrann",
    AUTHORIZE_URL: "https://auth.openai.com/oauth/authorize",
    TOKEN_URL: "https://auth.openai.com/oauth/token",
    SCOPE: "openid profile email offline_access",
    JWT_CLAIM_PATH: "https://api.openai.com/auth",
} as const;

export interface AuthData {
    access: string;
    refresh: string;
    expires: number;
    accountId: string;
}

// Extract accountId from JWT token
export function extractAccountId(token: string): string {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) throw new Error("Invalid token");
        const payload = JSON.parse(atob(parts[1]));
        const accountId = payload?.[AUTH_CONFIG.JWT_CLAIM_PATH]?.chatgpt_account_id;
        if (!accountId) throw new Error("No account ID in token");
        return accountId;
    } catch {
        throw new Error("Failed to extract accountId from token");
    }
}

// Check if token is expired (with 5 min buffer)
export function isExpired(auth: AuthData): boolean {
    return Date.now() > auth.expires - 5 * 60 * 1000;
}

// Client-side auth storage
const AUTH_STORAGE_KEY = "omo_auth";

export function saveAuthToStorage(auth: AuthData): void {
    if (typeof window !== "undefined") {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
    }
}

export function loadAuthFromStorage(): AuthData | null {
    if (typeof window === "undefined") return null;
    try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch { }
    return null;
}

export function clearAuthFromStorage(): void {
    if (typeof window !== "undefined") {
        localStorage.removeItem(AUTH_STORAGE_KEY);
    }
}

// Refresh access token (client-side)
export async function refreshToken(auth: AuthData): Promise<AuthData | null> {
    try {
        const response = await fetch(AUTH_CONFIG.TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: auth.refresh,
                client_id: AUTH_CONFIG.CLIENT_ID,
            }),
        });

        if (!response.ok) {
            console.error("Token refresh failed:", response.status);
            return null;
        }

        const json = await response.json() as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number
        };

        if (!json.access_token || !json.refresh_token || typeof json.expires_in !== "number") {
            return null;
        }

        const newAuth: AuthData = {
            access: json.access_token,
            refresh: json.refresh_token,
            expires: Date.now() + json.expires_in * 1000,
            accountId: extractAccountId(json.access_token),
        };
        saveAuthToStorage(newAuth);
        return newAuth;
    } catch (e) {
        console.error("Token refresh error:", e);
        return null;
    }
}

// Get valid auth (refresh if needed)
export async function getValidAuth(): Promise<AuthData | null> {
    let auth = loadAuthFromStorage();
    if (!auth) return null;

    if (isExpired(auth)) {
        console.log("Token expired, refreshing...");
        auth = await refreshToken(auth);
    }

    return auth;
}
