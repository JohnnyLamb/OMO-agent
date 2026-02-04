// PKCE utilities for OAuth 2.0
// Browser-compatible implementation

function base64URLEncode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
    // Generate random verifier
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const verifier = base64URLEncode(randomBytes.buffer);

    // Generate challenge (SHA-256 hash of verifier)
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const challenge = base64URLEncode(hashBuffer);

    return { verifier, challenge };
}
