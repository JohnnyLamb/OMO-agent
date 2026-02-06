/**
 * Storage abstraction interface
 * Allows switching between filesystem (CLI) and Supabase (cloud) storage
 */

export interface Storage {
    /**
     * Read a file's content
     * @returns file content or null if not found
     */
    read(path: string): Promise<string | null>;

    /**
     * Write content to a file (creates or overwrites)
     */
    write(path: string, content: string): Promise<void>;

    /**
     * List files matching a prefix
     * @param prefix - e.g. "memory/" to list all memory files
     * @returns array of file paths
     */
    list(prefix: string): Promise<string[]>;

    /**
     * Check if a file exists
     */
    exists(path: string): Promise<boolean>;

    /**
     * Delete a file
     */
    delete(path: string): Promise<void>;
}

export type StorageType = "filesystem" | "supabase";
