import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import type { Tool } from "./types.js";

const CODEX_URL = "https://chatgpt.com/backend-api/codex/responses";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
const DEFAULT_MODEL = "gpt-5.2-codex";

export interface AgentConfig {
    apiKey: string;
    accountId?: string;
    model?: string;
    tools?: Tool[];
    cwd?: string;
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

// Load system prompt from markdown files
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

// Extract accountId from JWT token
function extractAccountId(token: string): string {
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

// Convert tools to Responses API format
function convertTools(tools: Tool[]) {
    return tools.map((t) => ({
        type: "function",
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
        strict: null,
    }));
}

// Convert messages to Responses API format
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

export function createAgent(config: AgentConfig) {
    const apiKey = config.apiKey;
    const accountId = config.accountId ?? extractAccountId(apiKey);
    const model = config.model ?? DEFAULT_MODEL;
    const tools = config.tools ?? [];
    const cwd = config.cwd ?? process.cwd();

    const conversationHistory: { role: string; content: string }[] = [];

    async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
        const tool = tools.find((t) => t.name === name);
        if (!tool) return `Error: Unknown tool "${name}"`;
        return tool.execute({ ...input, _cwd: cwd });
    }

    async function chat(userMessage: string): Promise<void> {
        conversationHistory.push({ role: "user", content: userMessage });

        while (true) {
            const body = {
                model,
                store: false,
                stream: true,
                instructions: loadSystemPrompt(cwd),
                input: convertMessages(conversationHistory),
                text: { verbosity: "medium" },
                include: ["reasoning.encrypted_content"],
                tool_choice: "auto",
                parallel_tool_calls: true,
                tools: convertTools(tools),
            };

            const headers = new Headers();
            headers.set("Authorization", `Bearer ${apiKey}`);
            headers.set("chatgpt-account-id", accountId);
            headers.set("OpenAI-Beta", "responses=experimental");
            headers.set("originator", "omo");
            headers.set("User-Agent", `omo (${os.platform()} ${os.release()}; ${os.arch()})`);
            headers.set("accept", "text/event-stream");
            headers.set("content-type", "application/json");

            const response = await fetch(CODEX_URL, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error ${response.status}: ${errorText}`);
            }

            // Parse SSE stream
            const reader = response.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let responseText = "";
            const pendingToolCalls: { id: string; name: string; args: string }[] = [];
            let done = false;
            let hasPrintedLabel = false;

            while (!done) {
                const { done: streamDone, value } = await reader.read();
                if (streamDone) break;

                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE events
                let idx = buffer.indexOf("\n\n");
                while (idx !== -1) {
                    const chunk = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);

                    const dataLines = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
                    for (const data of dataLines) {
                        if (!data || data === "[DONE]") continue;
                        try {
                            const event = JSON.parse(data);

                            // Handle different event types
                            if (event.type === "response.output_text.delta") {
                                if (!hasPrintedLabel) {
                                    process.stdout.write("Omo: ");
                                    hasPrintedLabel = true;
                                }
                                process.stdout.write(event.delta || "");
                                responseText += event.delta || "";
                            } else if (event.type === "response.function_call_arguments.delta") {
                                const idx = event.output_index ?? 0;
                                if (!pendingToolCalls[idx]) {
                                    pendingToolCalls[idx] = { id: "", name: "", args: "" };
                                }
                                pendingToolCalls[idx].args += event.delta || "";
                            } else if (event.type === "response.output_item.added") {
                                if (event.item?.type === "function_call") {
                                    const idx = event.output_index ?? 0;
                                    pendingToolCalls[idx] = {
                                        id: event.item.call_id || event.item.id || `call_${idx}`,
                                        name: event.item.name || "",
                                        args: "",
                                    };
                                }
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

            // Filter out empty tool calls
            const toolCalls = pendingToolCalls.filter((tc) => tc.name);

            // If no tool calls, we're done
            if (toolCalls.length === 0) {
                console.log("\n");
                conversationHistory.push({ role: "assistant", content: responseText });
                return;
            }

            // Execute tools and add results
            conversationHistory.push({ role: "assistant", content: responseText || "(tool call)" });

            for (const tc of toolCalls) {
                console.log(`\n[Tool: ${tc.name}]`);
                try {
                    const input = JSON.parse(tc.args || "{}");
                    const result = await executeTool(tc.name, input);
                    console.log(`[Result: ${result.slice(0, 100)}${result.length > 100 ? "..." : ""}]`);
                    conversationHistory.push({ role: "user", content: `Tool "${tc.name}" returned: ${result}` });
                } catch (e) {
                    console.log(`[Error: ${e}]`);
                    conversationHistory.push({ role: "user", content: `Tool "${tc.name}" error: ${e}` });
                }
            }
        }
    }

    return { chat };
}