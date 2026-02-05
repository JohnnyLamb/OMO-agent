/**
 * Supabase storage implementation
 * Used for cloud mode - reads/writes to Supabase PostgreSQL
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Storage } from "./types.js";

interface FileRow {
    id: string;
    user_id: string;
    path: string;
    content: string;
    created_at: string;
    updated_at: string;
}

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
    if (!supabaseClient) {
        const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

        if (!url || !key) {
            throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables");
        }

        supabaseClient = createClient(url, key);
    }
    return supabaseClient;
}

export function createSupabaseStorage(userId: string): Storage {
    const supabase = getSupabaseClient();

    return {
        async read(filePath: string): Promise<string | null> {
            const { data, error } = await supabase
                .from("files")
                .select("content")
                .eq("user_id", userId)
                .eq("path", filePath)
                .single();

            if (error) {
                if (error.code === "PGRST116") {
                    // Row not found
                    return null;
                }
                throw error;
            }

            return data?.content ?? null;
        },

        async write(filePath: string, content: string): Promise<void> {
            const { error } = await supabase
                .from("files")
                .upsert(
                    {
                        user_id: userId,
                        path: filePath,
                        content,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "user_id,path" }
                );

            if (error) {
                throw error;
            }
        },

        async list(prefix: string): Promise<string[]> {
            const { data, error } = await supabase
                .from("files")
                .select("path")
                .eq("user_id", userId)
                .like("path", `${prefix}%`);

            if (error) {
                throw error;
            }

            return (data || []).map((row: { path: string }) => row.path);
        },

        async exists(filePath: string): Promise<boolean> {
            const { data, error } = await supabase
                .from("files")
                .select("id")
                .eq("user_id", userId)
                .eq("path", filePath)
                .single();

            if (error && error.code !== "PGRST116") {
                throw error;
            }

            return !!data;
        },

        async delete(filePath: string): Promise<void> {
            const { error } = await supabase
                .from("files")
                .delete()
                .eq("user_id", userId)
                .eq("path", filePath);

            if (error) {
                throw error;
            }
        },
    };
}

/**
 * Seed default files for a new user
 */
export async function seedDefaultFiles(userId: string): Promise<void> {
    const storage = createSupabaseStorage(userId);

    const defaultFiles: Record<string, string> = {
        "SOUL.md": `# SOUL.md

## Identity
- Name: Omo (思)
- Nature: Personal AI assistant
- Style: Polite, precise, confident

## Principles
- Be helpful and proactive
- Remember context from previous conversations
- Use tools when needed to accomplish tasks
`,
        "USER.md": `# USER.md

## Profile
- Add your preferences here
- Omo will learn from this file

## Preferences
- 
`,
        "AGENTS.md": `# AGENTS.md

## Every Session
1. Read SOUL.md — this is who you are
2. Read USER.md — this is who you're helping
3. Read recent memory logs for context
4. Greet the user and surface any open threads

## Memory
- Update daily logs with summaries
- Track open threads and follow-ups
`,
        "MEMORY.md": `# Long-Term Memory

## Identity & Preferences
- Assistant name: Omo

## Key Facts
- 

## Preferences
- 
`,
    };

    for (const [path, content] of Object.entries(defaultFiles)) {
        const exists = await storage.exists(path);
        if (!exists) {
            await storage.write(path, content);
        }
    }
}
