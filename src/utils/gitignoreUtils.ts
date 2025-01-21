import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';

export async function readGitignore(directoryPath: string): Promise<string[]> {
    try {
        const gitignorePath = path.join(directoryPath, '.gitignore');
        const content = await fs.readFile(gitignorePath, 'utf8');
        return content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    } catch {
        return [];
    }
}

export function isIgnored(filePath: string, patterns: string[]): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return patterns.some(pattern => {
        // Convert gitignore pattern to regex
        const regex = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        return new RegExp(regex).test(normalizedPath);
    });
}