import * as fs from "fs/promises";
import * as path from "path";
import type { Tool } from "../types.js";

export const writeTool: Tool = {
    name: "write",
    description: "Write content to a file. Creates parent directories if needed.",
    input_schema: {
        type: "object" as const,
        properties: {
            path: { type: "string", description: "File path to write" },
            content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
    },
    async execute(input) {
        const filePath = input.path as string;
        const content = input.content as string;
        const cwd = (input._cwd as string) || process.cwd();
        const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);

        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, content, "utf-8");
        return `Wrote ${content.length} bytes to ${resolved}`;
    },
};