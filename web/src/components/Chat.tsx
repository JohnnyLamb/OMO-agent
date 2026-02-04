"use client";

import { useState, useRef, useEffect } from "react";
import { getValidAuth, loadAuthFromStorage, saveAuthToStorage, clearAuthFromStorage, type AuthData } from "@/lib/auth";

interface Message {
    role: "user" | "assistant";
    content: string;
}

export default function Chat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
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
    }, [messages]);

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

            // Add empty assistant message
            setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

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
                                setIsThinking(event.status);
                            } else if (event.type === "token") {
                                assistantMessage += event.text;
                                setMessages((prev) => {
                                    const updated = [...prev];
                                    updated[updated.length - 1] = {
                                        role: "assistant",
                                        content: assistantMessage,
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
        } catch (e) {
            console.error("Chat error:", e);
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Error: ${e instanceof Error ? e.message : "Unknown error"}` },
            ]);
        } finally {
            setIsLoading(false);
            setIsThinking(false);
        }
    };

    if (isCheckingAuth) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
                <div className="animate-pulse text-white text-xl">Loading...</div>
            </div>
        );
    }

    if (!auth) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4">
                <div className="text-center max-w-md">
                    <h1 className="text-4xl font-bold text-white mb-4">🤖 OMO</h1>
                    <p className="text-slate-300 mb-8">
                        Your personal AI assistant. Login with your OpenAI account to get started.
                    </p>
                    <button
                        onClick={handleLogin}
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors shadow-lg"
                    >
                        Login with OpenAI
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gradient-to-br from-slate-900 to-slate-800">
            {/* Header */}
            <header className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50 backdrop-blur">
                <h1 className="text-xl font-bold text-white">🤖 OMO</h1>
                <button
                    onClick={handleLogout}
                    className="px-3 py-1 text-sm text-slate-300 hover:text-white transition-colors"
                >
                    Logout
                </button>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="flex items-center justify-center h-full text-slate-400">
                        <p>Send a message to start chatting with OMO</p>
                    </div>
                )}

                {messages.map((message, index) => (
                    <div
                        key={index}
                        className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                        <div
                            className={`max-w-[80%] md:max-w-[60%] p-4 rounded-2xl ${message.role === "user"
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-700 text-slate-100"
                                }`}
                        >
                            <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                    </div>
                ))}

                {isThinking && (
                    <div className="flex justify-start">
                        <div className="bg-slate-700 text-slate-100 p-4 rounded-2xl">
                            <div className="flex space-x-2">
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-4 border-t border-slate-700 bg-slate-800/50 backdrop-blur">
                <div className="flex gap-2 max-w-4xl mx-auto">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type a message..."
                        disabled={isLoading}
                        className="flex-1 px-4 py-3 bg-slate-700 text-white placeholder-slate-400 rounded-xl border border-slate-600 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Send
                    </button>
                </div>
            </form>
        </div>
    );
}
