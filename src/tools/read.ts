import * as fs from "fs/promises";
import * as path from "path";
import type { Tool } from "../types.js";

export const readTool: Tool = {
    name: "read",
    description: "Read the contents of a file at the specified path.",
    input_schema: {
        type: "object" as const,
        properties: {
            path: {
                type: "string",
                description: "The file path to read",
            },
        },
        required: ["path"],
    },
    async execute(input) {
        const filePath = input.path as string;
        const cwd = (input._cwd as string) || process.cwd();
        const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);

        try {
            return await fs.readFile(resolved, "utf-8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return `Error: File not found: ${resolved}`;
            }
            throw error;
        }
    },
};