"use client";

import { useState, useRef, useEffect } from "react";
import { getValidAuth, loadAuthFromStorage, saveAuthToStorage, clearAuthFromStorage, type AuthData } from "@/lib/auth";

interface Message {
    role: "user" | "assistant";
    content: string;
    thinkingDuration?: number;
    toolCalls?: { name: string; result?: string }[];
}

export default function Chat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
    const [currentTool, setCurrentTool] = useState<string | null>(null);
    const [pendingToolCalls, setPendingToolCalls] = useState<{ name: string; result?: string }[]>([]);
    const [auth, setAuth] = useState<AuthData | null>(null);
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Check for auth on mount
    useEffect(() => {
        async function checkAuth() {
            // First check for temp auth cookie from OAuth callback
            const tempAuthCookie = document.cookie
                .split("; ")
                .find((row) => row.startsWith("omo_auth_temp="));

            if (tempAuthCookie) {
                try {
                    const authData = JSON.parse(decodeURIComponent(tempAuthCookie.split("=")[1]));
                    saveAuthToStorage(authData);
                    setAuth(authData);
                    // Clear the temp cookie
                    document.cookie = "omo_auth_temp=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                } catch (e) {
                    console.error("Failed to parse auth cookie:", e);
                }
            } else {
                // Check localStorage
                const storedAuth = await getValidAuth();
                setAuth(storedAuth);
            }
            setIsCheckingAuth(false);
        }
        checkAuth();
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isThinking, currentTool]);

    const handleLogin = async () => {
        try {
            const response = await fetch("/api/auth/login");
            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (e) {
            console.error("Login failed:", e);
        }
    };

    const handleLogout = () => {
        clearAuthFromStorage();
        setAuth(null);
        setMessages([]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !auth || isLoading) return;

        const userMessage = input.trim();
        setInput("");
        setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
        setIsLoading(true);
        setIsThinking(true);
        setThinkingStartTime(Date.now());
        setPendingToolCalls([]);

        try {
            // Prepare history (exclude the message we just added visually)
            const history = messages.map((m) => ({
                role: m.role,
                content: m.content,
            }));

            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${auth.access}`,
                },
                body: JSON.stringify({
                    message: userMessage,
                    accountId: auth.accountId,
                    history,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // Handle SSE stream
            const reader = response.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let assistantMessage = "";
            let thinkingDuration = 0;
            const toolCalls: { name: string; result?: string }[] = [];

            // Add empty assistant message
            setMessages((prev) => [...prev, { role: "assistant", content: "", thinkingDuration: 0, toolCalls: [] }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                let idx = buffer.indexOf("\n\n");
                while (idx !== -1) {
                    const line = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);

                    if (line.startsWith("data: ")) {
                        try {
                            const event = JSON.parse(line.slice(6));

                            if (event.type === "thinking") {
                                if (!event.status && thinkingStartTime) {
                                    thinkingDuration = Math.round((Date.now() - thinkingStartTime) / 1000);
                                }
                                setIsThinking(event.status);
                            } else if (event.type === "token") {
                                assistantMessage += event.text;
                                setMessages((prev) => {
                                    const updated = [...prev];
                                    updated[updated.length - 1] = {
                                        role: "assistant",
                                        content: assistantMessage,
                                        thinkingDuration,
                                        toolCalls: [...toolCalls],
                                    };
                                    return updated;
                                });
                            } else if (event.type === "tool_start") {
                                setCurrentTool(event.name);
                                toolCalls.push({ name: event.name });
                                setPendingToolCalls([...toolCalls]);
                            } else if (event.type === "tool_end") {
                                setCurrentTool(null);
                                const lastTool = toolCalls[toolCalls.length - 1];
                                if (lastTool) {
                                    lastTool.result = event.result?.slice(0, 200) || "(done)";
                                }
                                setPendingToolCalls([...toolCalls]);
                                // Update message with tool results
                                setMessages((prev) => {
                                    const updated = [...prev];
                                    updated[updated.length - 1] = {
                                        role: "assistant",
                                        content: assistantMessage,
                                        thinkingDuration,
                                        toolCalls: [...toolCalls],
                                    };
                                    return updated;
                                });
                            } else if (event.type === "error") {
                                throw new Error(event.message);
                            }
                        } catch (e) {
                            if (!(e instanceof SyntaxError)) throw e;
                        }
                    }

                    idx = buffer.indexOf("\n\n");
                }
            }

            // Final update with thinking duration
            setMessages((prev) => {
                const updated = [...prev];
                if (updated.length > 0 && updated[updated.length - 1].role === "assistant") {
                    updated[updated.length - 1].thinkingDuration = thinkingDuration;
                    updated[updated.length - 1].toolCalls = toolCalls;
                }
                return updated;
            });
        } catch (e) {
            console.error("Chat error:", e);
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Error: ${e instanceof Error ? e.message : "Unknown error"}` },
            ]);
        } finally {
            setIsLoading(false);
            setIsThinking(false);
            setThinkingStartTime(null);
            setCurrentTool(null);
            setPendingToolCalls([]);
        }
    };

    if (isCheckingAuth) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-900">
                <div className="animate-pulse text-slate-400 text-lg">Loading...</div>
            </div>
        );
    }

    if (!auth) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4">
                <div className="text-center max-w-md">
                    <h1 className="text-4xl font-bold text-white mb-2">思</h1>
                    <h2 className="text-2xl font-semibold text-white mb-4">OMO</h2>
                    <p className="text-slate-400 mb-8">
                        Your personal AI assistant. Login with your OpenAI account to get started.
                    </p>
                    <button
                        onClick={handleLogin}
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors"
                    >
                        Login with OpenAI
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-900">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">思</span>
                    <h1 className="text-lg font-semibold text-white">OMO</h1>
                </div>
                <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                >
                    Logout
                </button>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                    {messages.length === 0 && (
                        <div className="flex items-center justify-center h-64 text-slate-500">
                            <p>Send a message to start chatting</p>
                        </div>
                    )}

                    {messages.map((message, index) => (
                        <div key={index}>
                            {message.role === "user" ? (
                                /* User message - right aligned bubble */
                                <div className="flex justify-end">
                                    <div className="max-w-[85%] bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-br-md">
                                        <p className="whitespace-pre-wrap">{message.content}</p>
                                    </div>
                                </div>
                            ) : (
                                /* Assistant message - left aligned, no bubble */
                                <div className="space-y-2">
                                    {/* Thinking duration indicator */}
                                    {message.thinkingDuration !== undefined && message.thinkingDuration > 0 && (
                                        <details className="text-sm">
                                            <summary className="cursor-pointer text-slate-500 hover:text-slate-400 select-none">
                                                <span className="ml-1">Thought for {message.thinkingDuration}s</span>
                                            </summary>
                                        </details>
                                    )}

                                    {/* Tool calls */}
                                    {message.toolCalls && message.toolCalls.length > 0 && (
                                        <details className="text-sm">
                                            <summary className="cursor-pointer text-slate-500 hover:text-slate-400 select-none">
                                                <span className="ml-1">Used {message.toolCalls.length} tool{message.toolCalls.length > 1 ? "s" : ""}</span>
                                            </summary>
                                            <div className="mt-2 ml-4 space-y-1 text-slate-500">
                                                {message.toolCalls.map((tc, i) => (
                                                    <div key={i} className="font-mono text-xs">
                                                        <span className="text-amber-500">{tc.name}</span>
                                                        {tc.result && (
                                                            <span className="text-slate-600 ml-2">→ {tc.result.slice(0, 50)}...</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </details>
                                    )}

                                    {/* Message content */}
                                    <div className="text-slate-200 leading-relaxed">
                                        <p className="whitespace-pre-wrap">{message.content}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Active thinking indicator */}
                    {isThinking && (
                        <div className="flex items-center gap-2 text-slate-500 text-sm">
                            <div className="flex space-x-1">
                                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                            </div>
                            <span>Thinking...</span>
                        </div>
                    )}

                    {/* Active tool indicator */}
                    {currentTool && (
                        <div className="flex items-center gap-2 text-amber-500 text-sm">
                            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>Running <code className="font-mono bg-slate-800 px-1.5 py-0.5 rounded">{currentTool}</code></span>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input */}
            <div className="border-t border-slate-800 p-4">
                <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Message OMO..."
                            disabled={isLoading}
                            className="flex-1 px-4 py-3 bg-slate-800 text-white placeholder-slate-500 rounded-xl border border-slate-700 focus:outline-none focus:border-slate-600 transition-colors disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Send
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
