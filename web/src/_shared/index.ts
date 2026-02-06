import prompts from "prompts";
import chalk from "chalk";
import ora, { type Ora } from "ora";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";

import { createAgent, type Agent } from "./agent.js";
import { codingTools } from "./tools/index.js";
import { getAuth, login, clearAuth, type AuthData } from "./auth.js";

// Configure marked to use terminal-friendly rendering
marked.setOptions({
    // @ts-ignore - types mismatch sometimes occurs with marked-terminal
    renderer: new TerminalRenderer()
});

const OMO_LABEL = chalk.blue.bold("Omo: ");

let currentAuth: AuthData | null = null;
let agent: Agent | null = null;
let spinner: Ora | null = null;
let hasPrintedLabel = false;

function setupAgentListeners(agent: Agent) {
    agent.on("thinking", ({ status }) => {
        if (status) {
            spinner = ora(chalk.dim("Thinking...")).start();
        } else if (spinner?.isSpinning) {
            spinner.stop();
            spinner = null;
        }
    });

    agent.on("token", ({ text }) => {
        if (!hasPrintedLabel) {
            process.stdout.write(OMO_LABEL);
            hasPrintedLabel = true;
        }
        process.stdout.write(text);
    });

    agent.on("tool_start", ({ name }) => {
        console.log(chalk.gray(`\n[Tool: ${name}]`));
    });

    agent.on("tool_end", ({ name, result, error }) => {
        if (error) {
            console.log(chalk.red(`[Error: ${error}]`));
        } else {
            const preview = result.slice(0, 100) + (result.length > 100 ? "..." : "");
            console.log(chalk.gray(`[Result: ${preview}]`));
        }
    });

    agent.on("response_end", () => {
        console.log("\n");
        hasPrintedLabel = false;
    });
}

async function initAgent(auth: AuthData) {
    currentAuth = auth;
    agent = createAgent({
        apiKey: auth.access,
        accountId: auth.accountId,
        tools: codingTools,
    });
    setupAgentListeners(agent);
}

async function handleCommand(input: string): Promise<boolean> {
    const cmd = input.trim().toLowerCase();

    if (cmd === "/login") {
        try {
            const auth = await login();
            await initAgent(auth);
            console.log("Ready to chat!\n");
        } catch (e) {
            console.error("Login failed:", e);
        }
        return true;
    }

    if (cmd === "/logout") {
        clearAuth();
        currentAuth = null;
        agent = null;
        console.log("Logged out. Use /login to authenticate.\n");
        return true;
    }

    if (cmd === "/help") {
        console.log("\nCommands:");
        console.log("  /login   - Login with ChatGPT account");
        console.log("  /logout  - Clear saved credentials");
        console.log("  /help    - Show this help\n");
        return true;
    }

    return false;
}

async function chatLoop() {
    let continueChat = true;

    while (continueChat) {
        hasPrintedLabel = false; // Reset for each turn

        const response = await prompts({
            type: "text",
            name: "value",
            message: chalk.green.bold("You"),
            style: "default",
        });

        // Handle Ctrl+C (response.value is undefined on exit)
        if (response.value === undefined) {
            console.log("\nGoodbye!");
            continueChat = false;
            process.exit(0);
        }

        const input = response.value;

        if (!input.trim()) continue;

        // Handle commands
        if (input.startsWith("/")) {
            await handleCommand(input);
            continue;
        }

        // Check if logged in
        if (!agent) {
            console.log("Not logged in. Use /login to authenticate.\n");
            continue;
        }

        // Chat with agent
        try {
            await agent.chat(input);
        } catch (error) {
            console.error("Error:", error);
        }
    }
}

async function main() {
    console.log("\n🤖 OMO Agent\n");

    // Try to load existing auth
    const auth = await getAuth();
    if (auth) {
        await initAgent(auth);
        console.log("Logged in. Type a message or /help for commands.\n");
    } else {
        console.log("Not logged in. Use /login to authenticate.\n");
    }

    await chatLoop();
}

main();