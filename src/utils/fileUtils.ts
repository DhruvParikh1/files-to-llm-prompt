import * as vscode from 'vscode';
import * as path from 'path';
import { readGitignore, isIgnored } from './gitignoreUtils';

interface ProcessOptions {
    includeHidden: boolean;
    includeDirectories: boolean;
    ignoreGitignore: boolean;
    ignorePatterns: string[];
    outputFormat: 'default' | 'claude-xml';
}

export async function generatePrompt(
    filePaths: string[],
    options: ProcessOptions
): Promise<string> {
    try {
        const files = await Promise.all(filePaths.map(async (filePath) => {
            const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            return {
                path: filePath,
                content: Buffer.from(content).toString('utf-8')
            };
        }));

        return formatOutput(files, options.outputFormat);
    } catch (error) {
        console.error('Error generating prompt:', error);
        throw error;
    }
}

export async function processFiles(
    filePaths: string[],
    options: ProcessOptions
): Promise<{ path: string; content: string }[]> {
    const results: { path: string; content: string }[] = [];
    const gitignorePatterns: string[] = [];

    if (!options.ignoreGitignore) {
        // Read all relevant .gitignore files
        for (const filePath of filePaths) {
            const dirPath = path.dirname(filePath);
            const patterns = await readGitignore(dirPath);
            gitignorePatterns.push(...patterns);
        }
    }

    for (const filePath of filePaths) {
        try {
            // Check if file should be ignored
            const fileName = path.basename(filePath);
            if (!options.includeHidden && fileName.startsWith('.')) {
                continue;
            }

            if (!options.ignoreGitignore && isIgnored(filePath, gitignorePatterns)) {
                continue;
            }

            if (options.ignorePatterns.length > 0 && 
                options.ignorePatterns.some(pattern => 
                    new RegExp(pattern).test(fileName))) {
                continue;
            }

            const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            results.push({
                path: filePath,
                content: Buffer.from(content).toString('utf-8')
            });
        } catch (error) {
            console.error(`Error processing file ${filePath}:`, error);
        }
    }

    return results;
}

export function formatOutput(
    files: { path: string; content: string }[],
    format: 'default' | 'claude-xml'
): string {
    if (format === 'claude-xml') {
        return formatClaudeXml(files);
    }
    return formatDefault(files);
}

function formatDefault(files: { path: string; content: string }[]): string {
    return files.map(file => 
        `${file.path}\n---\n${file.content}\n---`
    ).join('\n\n');
}

function formatClaudeXml(files: { path: string; content: string }[]): string {
    const fileContents = files.map((file, index) => 
        `<document index="${index + 1}">\n` +
        `<source>${file.path}</source>\n` +
        `<document_content>\n${file.content}\n</document_content>\n` +
        `</document>`
    ).join('\n');

    return `<documents>\n${fileContents}\n</documents>`;
}