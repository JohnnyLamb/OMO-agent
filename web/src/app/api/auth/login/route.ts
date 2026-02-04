import { NextRequest, NextResponse } from "next/server";
import { generatePKCE } from "@/lib/pkce";
import { AUTH_CONFIG } from "@/lib/auth";

// TODO: For production, register your actual redirect URI with OpenAI OAuth app
// Currently using the CLI's registered redirect URI for testing
// When deploying to Vercel, register: https://your-app.vercel.app/auth/callback
const REDIRECT_URI = "http://localhost:1455/auth/callback";

export async function GET(request: NextRequest) {
    const { verifier, challenge } = await generatePKCE();

    // Generate random state
    const stateBytes = new Uint8Array(16);
    crypto.getRandomValues(stateBytes);
    const state = Array.from(stateBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Build OAuth URL
    const url = new URL(AUTH_CONFIG.AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", AUTH_CONFIG.CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("scope", AUTH_CONFIG.SCOPE);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("id_token_add_organizations", "true");
    url.searchParams.set("codex_cli_simplified_flow", "true");
    url.searchParams.set("originator", "omo-web");

    // Store verifier and state in cookies for callback
    const response = NextResponse.json({
        url: url.toString(),
        state
    });

    // Set httpOnly cookies for security
    response.cookies.set("omo_verifier", verifier, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 600, // 10 minutes
        path: "/",
    });

    response.cookies.set("omo_state", state, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 600,
        path: "/",
    });

    response.cookies.set("omo_redirect_uri", REDIRECT_URI, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 600,
        path: "/",
    });

    return response;
}
