import { exec } from "child_process";
import { promisify } from "util";
import type { Tool } from "../types.js";

const execAsync = promisify(exec);

export const bashTool: Tool = {
    name: "bash",
    description: "Execute a bash command and return the output.",
    input_schema: {
        type: "object" as const,
        properties: {
            command: {
                type: "string",
                description: "The bash command to execute",
            },
        },
        required: ["command"],
    },
    async execute(input) {
        const command = input.command as string;
        const cwd = (input._cwd as string) || process.cwd();

        try {
            const { stdout, stderr } = await execAsync(command, { cwd, timeout: 30000 });
            return stdout + (stderr ? `\nstderr: ${stderr}` : "") || "(no output)";
        } catch (error) {
            const e = error as { message: string; stdout?: string; stderr?: string };
            return `Error: ${e.message}${e.stderr ? `\n${e.stderr}` : ""}`;
        }
    },
};