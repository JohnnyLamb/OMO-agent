import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as http from "http";
import * as crypto from "crypto";
import { generatePKCE } from "./pkce.js";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const SCOPE = "openid profile email offline_access";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

const AUTH_DIR = path.join(os.homedir(), ".omo");
const AUTH_FILE = path.join(AUTH_DIR, "auth.json");

export interface AuthData {
    access: string;
    refresh: string;
    expires: number;
    accountId: string;
}

// Load saved auth
export function loadAuth(): AuthData | null {
    try {
        if (fs.existsSync(AUTH_FILE)) {
            return JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
        }
    } catch { }
    return null;
}

// Save auth
export function saveAuth(auth: AuthData): void {
    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
    fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2));
}

// Clear auth
export function clearAuth(): void {
    try {
        if (fs.existsSync(AUTH_FILE)) {
            fs.unlinkSync(AUTH_FILE);
        }
    } catch { }
}

// Extract accountId from JWT token
export function extractAccountId(token: string): string {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) throw new Error("Invalid token");
        const payload = JSON.parse(atob(parts[1]));
        const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
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

// Refresh access token
export async function refreshToken(auth: AuthData): Promise<AuthData | null> {
    try {
        const response = await fetch(TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: auth.refresh,
                client_id: CLIENT_ID,
            }),
        });

        if (!response.ok) {
            console.error("Token refresh failed:", response.status);
            return null;
        }

        const json = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
        if (!json.access_token || !json.refresh_token || typeof json.expires_in !== "number") {
            return null;
        }

        const newAuth: AuthData = {
            access: json.access_token,
            refresh: json.refresh_token,
            expires: Date.now() + json.expires_in * 1000,
            accountId: extractAccountId(json.access_token),
        };
        saveAuth(newAuth);
        return newAuth;
    } catch (e) {
        console.error("Token refresh error:", e);
        return null;
    }
}

// Login flow
export async function login(): Promise<AuthData> {
    const { verifier, challenge } = await generatePKCE();
    const state = crypto.randomBytes(16).toString("hex");

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("id_token_add_organizations", "true");
    url.searchParams.set("codex_cli_simplified_flow", "true");
    url.searchParams.set("originator", "omo");

    console.log("\nOpen this URL in your browser to login:\n");
    console.log(url.toString());
    console.log("\nWaiting for authentication...\n");

    // Open browser automatically
    const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    const { exec } = await import("child_process");
    exec(`${openCmd} "${url.toString()}"`);

    // Start local callback server
    const code = await waitForCallback(state);

    // Exchange code for tokens
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: CLIENT_ID,
            code,
            code_verifier: verifier,
            redirect_uri: REDIRECT_URI,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token exchange failed: ${response.status} ${text}`);
    }

    const json = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!json.access_token || !json.refresh_token || typeof json.expires_in !== "number") {
        throw new Error("Invalid token response");
    }

    const auth: AuthData = {
        access: json.access_token,
        refresh: json.refresh_token,
        expires: Date.now() + json.expires_in * 1000,
        accountId: extractAccountId(json.access_token),
    };
    saveAuth(auth);

    console.log("✓ Login successful!\n");
    return auth;
}

// Wait for OAuth callback
function waitForCallback(expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            try {
                const url = new URL(req.url || "", "http://localhost");
                if (url.pathname !== "/auth/callback") {
                    res.statusCode = 404;
                    res.end("Not found");
                    return;
                }

                if (url.searchParams.get("state") !== expectedState) {
                    res.statusCode = 400;
                    res.end("State mismatch");
                    return;
                }

                const code = url.searchParams.get("code");
                if (!code) {
                    res.statusCode = 400;
                    res.end("Missing code");
                    return;
                }

                res.statusCode = 200;
                res.setHeader("Content-Type", "text/html");
                res.end(`<!doctype html><html><body><p>Authentication successful! You can close this tab.</p></body></html>`);

                server.close();
                resolve(code);
            } catch (e) {
                res.statusCode = 500;
                res.end("Error");
                reject(e);
            }
        });

        server.listen(1455, "127.0.0.1", () => {
            // Server started
        });

        // Timeout after 2 minutes
        setTimeout(() => {
            server.close();
            reject(new Error("Login timeout - no callback received"));
        }, 2 * 60 * 1000);
    });
}

// Get valid auth (refresh if needed)
export async function getAuth(): Promise<AuthData | null> {
    let auth = loadAuth();
    if (!auth) return null;

    if (isExpired(auth)) {
        console.log("Token expired, refreshing...");
        auth = await refreshToken(auth);
    }

    return auth;
}
