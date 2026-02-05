import { NextRequest } from "next/server";
import { createAgent, type AgentEvents } from "@agent/agent";
import { codingTools } from "@agent/tools/index";
import { createSupabaseStorage, seedDefaultFiles, type Storage } from "@agent/storage/index";

/**
 * Load system prompt from Supabase storage
 */
async function loadSystemPromptFromStorage(storage: Storage): Promise<string> {
    const files = ["SOUL.md", "USER.md", "AGENTS.md"];
    const parts: string[] = [];

    for (const file of files) {
        const content = await storage.read(file);
        if (content) {
            parts.push(content);
        }
    }

    // Load most recent memory log
    const memoryFiles = await storage.list("memory/");
    if (memoryFiles.length > 0) {
        // Sort by path (which includes date) descending
        const sorted = memoryFiles
            .filter((f) => /memory\/\d{4}-\d{2}-\d{2}\.md$/.test(f))
            .sort((a, b) => b.localeCompare(a));

        if (sorted.length > 0) {
            const content = await storage.read(sorted[0]);
            if (content && content.length > 200) {
                parts.push(content);
            }
        }
    }

    // Load long-term memory
    const longTermMemory = await storage.read("MEMORY.md");
    if (longTermMemory) {
        parts.push(longTermMemory);
    }

    return parts.length > 0
        ? parts.join("\n\n---\n\n")
        : "You are OMO, a helpful AI coding assistant.";
}

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return new Response(JSON.stringify({ error: "Missing authorization" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }

        const accessToken = authHeader.slice(7);
        const body = await request.json() as {
            message: string;
            accountId: string;
            history?: { role: string; content: string }[];
        };

        if (!body.message || !body.accountId) {
            return new Response(JSON.stringify({ error: "Missing message or accountId" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Create storage for this user
        const storage = createSupabaseStorage(body.accountId);

        // Seed default files for new users
        await seedDefaultFiles(body.accountId);

        // Load system prompt from storage
        const systemPrompt = await loadSystemPromptFromStorage(storage);

        const agent = createAgent({
            apiKey: accessToken,
            accountId: body.accountId,
            systemPrompt,
            tools: codingTools,
        });

        // Create SSE stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                agent.on("thinking", ({ status }: { status: boolean }) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking", status })}\n\n`));
                });

                agent.on("token", ({ text }: { text: string }) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", text })}\n\n`));
                });

                agent.on("tool_start", ({ name, args }: { name: string; args: Record<string, unknown> }) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_start", name, args })}\n\n`));
                });

                agent.on("tool_end", ({ name, result, error }: { name: string; result: string; error?: string }) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool_end", name, result: result.slice(0, 500), error })}\n\n`));
                });

                agent.on("response_end", ({ fullText }: { fullText: string }) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "response_end", fullText })}\n\n`));
                    controller.close();
                });

                try {
                    await agent.chat(body.message, body.history || []);
                } catch (e) {
                    const errorMsg = e instanceof Error ? e.message : String(e);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: errorMsg })}\n\n`));
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        return new Response(JSON.stringify({ error: errorMsg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
