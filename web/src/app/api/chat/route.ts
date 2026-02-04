import { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";

// ============================================================================
// Agent Core (Embedded version for web)
// ============================================================================

const CODEX_URL = "https://chatgpt.com/backend-api/codex/responses";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
const DEFAULT_MODEL = "gpt-5.2-codex";

// Path to the OMO-agent directory (relative to web/)
const OMO_AGENT_DIR = path.resolve(process.cwd(), "..");

interface AgentEvents {
    thinking: { status: boolean };
    token: { text: string };
    tool_start: { name: string; args: Record<string, unknown> };
    tool_end: { name: string; result: string; error?: string };
    response_end: { fullText: string };
}

interface AgentConfig {
    apiKey: string;
    accountId: string;
    model?: string;
}

// Format date as YYYY-MM-DD
function formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function ensureMemoryFiles(cwd: string) {
    const memoryDir = path.join(cwd, "memory");
    if (!fs.existsSync(memoryDir)) {
        fs.mkdirSync(memoryDir, { recursive: true });
    }

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const todayPath = path.join(memoryDir, `${formatDate(today)}.md`);
    const yesterdayPath = path.join(memoryDir, `${formatDate(yesterday)}.md`);
    const longTermPath = path.join(cwd, "MEMORY.md");

    const dailyTemplate = (date: Date) => `# Daily Log - ${formatDate(date)}\n\n- **Summary**: \n- **Top Priorities**:\n  - [ ] \n  - [ ] \n- **Accomplishments**:\n  - \n- **Decisions Made**:\n  - \n- **Open Threads / Follow-ups**:\n  - \n- **Notes**:\n  - \n`;

    if (!fs.existsSync(todayPath)) fs.writeFileSync(todayPath, dailyTemplate(today), "utf-8");
    if (!fs.existsSync(yesterdayPath)) fs.writeFileSync(yesterdayPath, dailyTemplate(yesterday), "utf-8");
    if (!fs.existsSync(longTermPath)) fs.writeFileSync(longTermPath, "", "utf-8");

    return { todayPath, yesterdayPath, longTermPath };
}

// Load system prompt from markdown files (same as CLI)
function loadSystemPrompt(cwd: string): string {
    // Check for bootstrap mode first
    const bootstrapPath = path.join(cwd, "BOOTSTRAP.md");
    if (fs.existsSync(bootstrapPath)) {
        return fs.readFileSync(bootstrapPath, "utf-8");
    }

    // Normal mode: load identity files
    const files = ["IDENTITY.md", "SOUL.md", "USER.md", "AGENTS.md"];
    const parts: string[] = [];

    for (const file of files) {
        const filePath = path.join(cwd, file);
        try {
            if (fs.existsSync(filePath)) {
                parts.push(fs.readFileSync(filePath, "utf-8"));
            }
        } catch { }
    }

    // Memory files (daily + long-term)
    try {
        const { todayPath, yesterdayPath, longTermPath } = ensureMemoryFiles(cwd);
        if (fs.existsSync(todayPath)) parts.push(fs.readFileSync(todayPath, "utf-8"));
        if (fs.existsSync(yesterdayPath)) parts.push(fs.readFileSync(yesterdayPath, "utf-8"));
        if (fs.existsSync(longTermPath)) parts.push(fs.readFileSync(longTermPath, "utf-8"));
    } catch { }

    return parts.length > 0
        ? parts.join("\n\n---\n\n")
        : "You are OMO, a helpful AI coding assistant.";
}

function convertMessages(messages: { role: string; content: string }[]) {
    return messages.map((m) => ({
        type: "message",
        role: m.role,
        content: [{
            type: m.role === "assistant" ? "output_text" : "input_text",
            text: m.content,
        }],
    }));
}

interface Agent extends EventEmitter {
    chat(userMessage: string, history: { role: string; content: string }[]): Promise<string>;
    on<K extends keyof AgentEvents>(event: K, listener: (payload: AgentEvents[K]) => void): this;
    emit<K extends keyof AgentEvents>(event: K, payload: AgentEvents[K]): boolean;
}

function createAgent(config: AgentConfig): Agent {
    const apiKey = config.apiKey;
    const accountId = config.accountId;
    const model = config.model ?? DEFAULT_MODEL;

    const emitter = new EventEmitter() as Agent;

    async function chat(userMessage: string, history: { role: string; content: string }[]): Promise<string> {
        const conversationHistory = [...history, { role: "user", content: userMessage }];

        // Load system prompt from identity files
        const systemPrompt = loadSystemPrompt(OMO_AGENT_DIR);

        const body = {
            model,
            store: false,
            stream: true,
            instructions: systemPrompt,
            input: convertMessages(conversationHistory),
            text: { verbosity: "medium" },
            include: ["reasoning.encrypted_content"],
            tool_choice: "none", // No tools in web version for now
            tools: [],
        };

        const headers = new Headers();
        headers.set("Authorization", `Bearer ${apiKey}`);
        headers.set("chatgpt-account-id", accountId);
        headers.set("OpenAI-Beta", "responses=experimental");
        headers.set("originator", "omo-web");
        headers.set("User-Agent", `omo-web`);
        headers.set("accept", "text/event-stream");
        headers.set("content-type", "application/json");

        emitter.emit("thinking", { status: true });

        const response = await fetch(CODEX_URL, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let responseText = "";
        let done = false;
        let hasEmittedFirstToken = false;

        while (!done) {
            const { done: streamDone, value } = await reader.read();
            if (streamDone) break;

            if (!hasEmittedFirstToken) {
                emitter.emit("thinking", { status: false });
            }

            buffer += decoder.decode(value, { stream: true });

            let idx = buffer.indexOf("\n\n");
            while (idx !== -1) {
                const chunk = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);

                const dataLines = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
                for (const data of dataLines) {
                    if (!data || data === "[DONE]") continue;
                    try {
                        const event = JSON.parse(data);

                        if (event.type === "response.output_text.delta") {
                            hasEmittedFirstToken = true;
                            emitter.emit("token", { text: event.delta || "" });
                            responseText += event.delta || "";
                        } else if (event.type === "response.completed" || event.type === "response.done") {
                            done = true;
                        } else if (event.type === "error") {
                            throw new Error(event.message || "API error");
                        }
                    } catch (e) {
                        if (e instanceof SyntaxError) continue;
                        throw e;
                    }
                }
                idx = buffer.indexOf("\n\n");
            }
        }

        emitter.emit("response_end", { fullText: responseText });
        return responseText;
    }

    emitter.chat = chat;
    return emitter;
}

// ============================================================================
// API Route Handler
// ============================================================================

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

        const agent = createAgent({
            apiKey: accessToken,
            accountId: body.accountId,
        });

        // Create SSE stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                agent.on("thinking", ({ status }) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking", status })}\n\n`));
                });

                agent.on("token", ({ text }) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", text })}\n\n`));
                });

                agent.on("response_end", ({ fullText }) => {
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
