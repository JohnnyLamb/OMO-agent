/**
 * Filesystem storage implementation
 * Used for CLI mode - reads/writes to local filesystem
 */

import * as fs from "fs";
import * as path from "path";
import type { Storage } from "./types.js";

export function createFilesystemStorage(baseDir: string): Storage {
    // Ensure base directory exists
    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }

    function resolvePath(filePath: string): string {
        return path.join(baseDir, filePath);
    }

    return {
        async read(filePath: string): Promise<string | null> {
            const fullPath = resolvePath(filePath);
            try {
                return fs.readFileSync(fullPath, "utf-8");
            } catch (e) {
                if ((e as NodeJS.ErrnoException).code === "ENOENT") {
                    return null;
                }
                throw e;
            }
        },

        async write(filePath: string, content: string): Promise<void> {
            const fullPath = resolvePath(filePath);
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, content, "utf-8");
        },

        async list(prefix: string): Promise<string[]> {
            const fullPath = resolvePath(prefix);
            try {
                const entries = fs.readdirSync(fullPath, { withFileTypes: true });
                return entries
                    .filter((e) => e.isFile())
                    .map((e) => path.join(prefix, e.name));
            } catch (e) {
                if ((e as NodeJS.ErrnoException).code === "ENOENT") {
                    return [];
                }
                throw e;
            }
        },

        async exists(filePath: string): Promise<boolean> {
            const fullPath = resolvePath(filePath);
            return fs.existsSync(fullPath);
        },

        async delete(filePath: string): Promise<void> {
            const fullPath = resolvePath(filePath);
            try {
                fs.unlinkSync(fullPath);
            } catch (e) {
                if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
                    throw e;
                }
            }
        },
    };
}
