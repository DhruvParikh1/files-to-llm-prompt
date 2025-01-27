import { encoding_for_model } from 'tiktoken';

let tokenEncoder: any = null;

export async function initializeEncoder(): Promise<void> {
    if (!tokenEncoder) {
        tokenEncoder = await encoding_for_model('gpt-4o');
    }
}

export async function countTokens(text: string): Promise<number> {
    try {
        if (!tokenEncoder) {
            await initializeEncoder();
        }
        return tokenEncoder.encode(text).length;
    } catch (error) {
        console.error('Error counting tokens:', error);
        return 0;
    }
}

// Cleanup function
export function disposeEncoder(): void {
    if (tokenEncoder) {
        tokenEncoder.free();
        tokenEncoder = null;
    }
}