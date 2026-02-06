import type Anthropic from "@anthropic-ai/sdk"

/**
 * Tool definition for the OMO agent
 */

export interface Tool {
    name: string;
    description: string;
    input_schema: Anthropic.Tool['input_schema'];
    execute: (input: Record<string, unknown>) => Promise<string>;
}