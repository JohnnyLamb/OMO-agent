import * as fs from "fs/promises";
import * as path from "path";
import type { Tool } from "../types.js";

export const editTool: Tool = {
    name: "edit",
    description: "Edit a file by finding and replacing text exactly.",
    input_schema: {
        type: "object" as const,
        properties: {
            path: { type: "string", description: "File path" },
            search: { type: "string", description: "Text to find" },
            replace: { type: "string", description: "Replacement text" },
        },
        required: ["path", "search", "replace"],
    },
    async execute(input) {
        const filePath = input.path as string;
        const search = input.search as string;
        const replace = input.replace as string;
        const cwd = (input._cwd as string) || process.cwd();
        const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);

        const content = await fs.readFile(resolved, "utf-8");
        if (!content.includes(search)) return `Error: Text not found in ${resolved}`;
        await fs.writeFile(resolved, content.replace(search, replace), "utf-8");
        return `Edited ${resolved}`;
    },
};