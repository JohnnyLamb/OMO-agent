import { NextRequest, NextResponse } from "next/server";
import { AUTH_CONFIG, extractAccountId } from "@/lib/auth";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Handle OAuth errors
    if (error) {
        return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
    }

    if (!code || !state) {
        return NextResponse.redirect(new URL("/?error=missing_params", request.url));
    }

    // Verify state
    const storedState = request.cookies.get("omo_state")?.value;
    if (state !== storedState) {
        return NextResponse.redirect(new URL("/?error=state_mismatch", request.url));
    }

    // Get verifier and redirect URI from cookies
    const verifier = request.cookies.get("omo_verifier")?.value;
    const redirectUri = request.cookies.get("omo_redirect_uri")?.value;

    if (!verifier || !redirectUri) {
        return NextResponse.redirect(new URL("/?error=missing_verifier", request.url));
    }

    try {
        // Exchange code for tokens
        const tokenResponse = await fetch(AUTH_CONFIG.TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                client_id: AUTH_CONFIG.CLIENT_ID,
                code,
                code_verifier: verifier,
                redirect_uri: redirectUri,
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error("Token exchange failed:", errorText);
            return NextResponse.redirect(new URL("/?error=token_exchange_failed", request.url));
        }

        const tokens = await tokenResponse.json() as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number
        };

        if (!tokens.access_token || !tokens.refresh_token || typeof tokens.expires_in !== "number") {
            return NextResponse.redirect(new URL("/?error=invalid_token_response", request.url));
        }

        const accountId = extractAccountId(tokens.access_token);

        // Build auth data to pass to client
        const authData = {
            access: tokens.access_token,
            refresh: tokens.refresh_token,
            expires: Date.now() + tokens.expires_in * 1000,
            accountId,
        };

        // Redirect to home with auth data in URL hash (client-side only, not sent to server)
        const redirectUrl = new URL("/", request.url);

        // We'll pass auth data via a temporary cookie that the client will read and clear
        const response = NextResponse.redirect(redirectUrl);

        response.cookies.set("omo_auth_temp", JSON.stringify(authData), {
            httpOnly: false, // Client needs to read this
            secure: !redirectUri.includes("localhost"),
            sameSite: "lax",
            maxAge: 60, // Very short-lived
            path: "/",
        });

        // Clear the OAuth cookies
        response.cookies.delete("omo_verifier");
        response.cookies.delete("omo_state");
        response.cookies.delete("omo_redirect_uri");

        return response;
    } catch (e) {
        console.error("Callback error:", e);
        return NextResponse.redirect(new URL("/?error=callback_error", request.url));
    }
}
