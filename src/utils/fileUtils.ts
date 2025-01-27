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

interface TreeNode {
    name: string;
    type: 'file' | 'directory';
    children?: TreeNode[];
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


export async function generateTreeStructure(
    basePath: string,
    options: ProcessOptions
): Promise<string> {
    const tree = await buildTree(basePath, options);
    return tree ? formatTree(tree, '', true) : '';
}

async function buildTree(
    currentPath: string,
    options: ProcessOptions,
    depth: number = 0
): Promise<TreeNode | null> {
    const stats = await vscode.workspace.fs.stat(vscode.Uri.file(currentPath));
    const name = path.basename(currentPath);

    // Check if the current item should be included based on options
    if (!shouldIncludeInTree(name, stats.type === vscode.FileType.Directory, currentPath, options)) {
        return null;
    }

    if (stats.type === vscode.FileType.File) {
        return { name, type: 'file' };
    }

    // Handle directory
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
    const children: TreeNode[] = [];

    for (const [childName, childType] of entries) {
        const childPath = path.join(currentPath, childName);
        const childNode = await buildTree(childPath, options, depth + 1);
        if (childNode) {
            children.push(childNode);
        }
    }

    // Sort children: directories first, then files, both alphabetically
    children.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });

    return { name, type: 'directory', children };
}

function formatTree(node: TreeNode, prefix: string, isLast: boolean): string {
    if (!node) {return '';}

    let result = prefix;
    
    // Add appropriate prefix characters
    if (prefix) {
        result += isLast ? '└── ' : '├── ';
    }
    
    result += node.name + '\n';
    
    if (node.type === 'directory' && node.children) {
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const isLastChild = i === node.children.length - 1;
            result += formatTree(child, childPrefix, isLastChild);
        }
    }
    
    return result;
}

function shouldIncludeInTree(
    name: string,
    isDirectory: boolean,
    fullPath: string,
    options: ProcessOptions
): boolean {
    // Reuse existing shouldInclude logic from FileExplorerProvider
    // but simplified for tree structure
    if (!options.includeHidden && name.startsWith('.')) {
        return false;
    }

    const ignorePatterns = options.ignorePatterns || [];
    for (const pattern of ignorePatterns) {
        if (!pattern.trim()) {continue;}
        
        // Convert glob pattern to regex
        const regex = new RegExp(pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.'));
            
        if (regex.test(name)) {
            return false;
        }
    }

    if (!options.ignoreGitignore) {
        // Add gitignore checking logic here
    }

    return true;
}
