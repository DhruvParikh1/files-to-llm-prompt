import * as vscode from 'vscode';
import * as path from 'path';
import { readGitignore, isIgnored } from './gitignoreUtils';

interface ProcessOptions {
    includeHidden: boolean;
    includeDirectories: boolean;
    ignoreGitignore: boolean;
    ignorePatterns: string[];
    outputFormat: 'default' | 'claude-xml';
    pathStyle?: 'absolute' | 'relative';
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
                path: getOutputPath(filePath, options.pathStyle || 'absolute'),
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

            if (
                options.ignorePatterns.length > 0 &&
                options.ignorePatterns.some(pattern => new RegExp(pattern).test(fileName))
            ) {
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

function getOutputPath(filePath: string, pathStyle: 'absolute' | 'relative'): string {
    if (pathStyle === 'absolute') {
        return filePath;
    }

    const fileUri = vscode.Uri.file(filePath);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
    if (!workspaceFolder) {
        return filePath;
    }

    return path.relative(workspaceFolder.uri.fsPath, filePath).replace(/\\/g, '/');
}

function formatDefault(files: { path: string; content: string }[]): string {
    return files.map(file => `${file.path}\n---\n${file.content}\n---`).join('\n\n');
}

function formatClaudeXml(files: { path: string; content: string }[]): string {
    const fileContents = files
        .map(
            (file, index) =>
                `<document index="${index + 1}">\n` +
                `<source>${file.path}</source>\n` +
                `<document_content>\n${file.content}\n</document_content>\n` +
                `</document>`
        )
        .join('\n');

    return `<documents>\n${fileContents}\n</documents>`;
}

export async function generateTreeStructure(
    basePath: string,
    options: ProcessOptions
): Promise<string> {
    const tree = await buildTree(basePath, options);
    return tree ? formatTreeRoot(tree) : '';
}

export function generateSelectedTreeStructure(filePaths: string[]): string {
    if (filePaths.length === 0) {
        return '';
    }

    const roots = new Map<string, TreeNode>();

    for (const filePath of filePaths) {
        const fileUri = vscode.Uri.file(filePath);
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);

        if (!workspaceFolder) {
            const fallbackRoot = getOrCreateRoot(roots, 'external-files');
            insertPathIntoTree(fallbackRoot, [path.basename(filePath)]);
            continue;
        }

        const rootName = workspaceFolder.name;
        const relativePath = path.relative(workspaceFolder.uri.fsPath, filePath).replace(/\\/g, '/');
        const segments = relativePath.split('/').filter(Boolean);
        if (segments.length === 0) {
            continue;
        }

        const rootNode = getOrCreateRoot(roots, rootName);
        insertPathIntoTree(rootNode, segments);
    }

    const rootNodes = Array.from(roots.values());
    rootNodes.forEach(sortTreeRecursively);
    rootNodes.sort(compareTreeNodes);

    return rootNodes.map(node => formatTreeRoot(node)).join('');
}

function getOrCreateRoot(roots: Map<string, TreeNode>, rootName: string): TreeNode {
    const existing = roots.get(rootName);
    if (existing) {
        return existing;
    }

    const created: TreeNode = {
        name: rootName,
        type: 'directory',
        children: []
    };
    roots.set(rootName, created);
    return created;
}

function insertPathIntoTree(root: TreeNode, segments: string[]): void {
    let cursor = root;

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const isFile = i === segments.length - 1;

        if (!cursor.children) {
            cursor.children = [];
        }

        let child = cursor.children.find(candidate => candidate.name === segment);
        if (!child) {
            child = {
                name: segment,
                type: isFile ? 'file' : 'directory',
                children: isFile ? undefined : []
            };
            cursor.children.push(child);
        } else if (!isFile && child.type === 'file') {
            child.type = 'directory';
            child.children = child.children || [];
        }

        cursor = child;
    }
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

    for (const [childName] of entries) {
        const childPath = path.join(currentPath, childName);
        const childNode = await buildTree(childPath, options, depth + 1);
        if (childNode) {
            children.push(childNode);
        }
    }

    // Sort children: directories first, then files, both alphabetically
    children.sort(compareTreeNodes);

    return { name, type: 'directory', children };
}

function sortTreeRecursively(node: TreeNode): void {
    if (node.type !== 'directory' || !node.children) {
        return;
    }

    node.children.forEach(sortTreeRecursively);
    node.children.sort(compareTreeNodes);
}

function compareTreeNodes(a: TreeNode, b: TreeNode): number {
    if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
}

function formatTreeRoot(node: TreeNode): string {
    let result = `${node.name}\n`;

    if (node.type === 'directory' && node.children) {
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const isLastChild = i === node.children.length - 1;
            result += formatTreeChild(child, '', isLastChild);
        }
    }

    return result;
}

function formatTreeChild(node: TreeNode, prefix: string, isLast: boolean): string {
    const branch = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
    let result = `${prefix}${branch}${node.name}\n`;

    if (node.type === 'directory' && node.children) {
        const childPrefix = `${prefix}${isLast ? '    ' : '\u2502   '}`;

        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const isLastChild = i === node.children.length - 1;
            result += formatTreeChild(child, childPrefix, isLastChild);
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
        if (!pattern.trim()) {
            continue;
        }

        // Convert glob pattern to regex
        const regex = new RegExp(pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.'));

        if (regex.test(name)) {
            return false;
        }
    }

    if (!options.ignoreGitignore) {
        // Add gitignore checking logic here
    }

    return true;
}
