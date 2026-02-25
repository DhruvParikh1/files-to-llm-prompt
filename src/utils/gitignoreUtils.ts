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

interface GitignoreRule {
    pattern: string;
    negate: boolean;
    directoryOnly: boolean;
    anchored: boolean;
    matchBasenameOnly: boolean;
}

function parseGitignoreRules(content: string): GitignoreRule[] {
    return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'))
        .map(line => {
            const negate = line.startsWith('!');
            let pattern = negate ? line.slice(1) : line;
            const directoryOnly = pattern.endsWith('/');
            if (directoryOnly) {
                pattern = pattern.slice(0, -1);
            }
            const anchored = pattern.startsWith('/');
            if (anchored) {
                pattern = pattern.slice(1);
            }
            return {
                pattern,
                negate,
                directoryOnly,
                anchored,
                matchBasenameOnly: !pattern.includes('/')
            };
        })
        .filter(rule => rule.pattern.length > 0);
}

function globToRegExp(globPattern: string): RegExp {
    const escaped = globPattern
        .replace(/\\/g, '/')
        .replace(/[.+^${}()|[\]]/g, '\\$&')
        .replace(/\*\*/g, '__GLOBSTAR__')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(/__GLOBSTAR__/g, '.*');
    return new RegExp(`^${escaped}$`);
}

function getAncestorDirectories(startPath: string, rootPath: string): string[] {
    const ancestors: string[] = [];
    let current = startPath;

    while (true) {
        ancestors.push(current);
        if (path.resolve(current) === path.resolve(rootPath)) {
            break;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }

    return ancestors.reverse();
}

function normalizeRelative(input: string): string {
    return input.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function applyRules(
    relativeToGitignore: string,
    basename: string,
    isDirectory: boolean,
    rules: GitignoreRule[],
    initialIgnored: boolean
): boolean {
    const normalizedRelative = normalizeRelative(relativeToGitignore);
    let ignored = initialIgnored;

    for (const rule of rules) {
        if (rule.directoryOnly && !isDirectory) {
            continue;
        }

        const matcher = globToRegExp(rule.pattern);
        const target = rule.matchBasenameOnly ? basename : normalizedRelative;
        const candidate = rule.anchored ? normalizedRelative : target;

        if (matcher.test(candidate)) {
            ignored = !rule.negate;
        }
    }

    return ignored;
}

export async function isPathIgnoredByGitignore(
    fsPath: string,
    isDirectory: boolean
): Promise<boolean> {
    const fileUri = vscode.Uri.file(fsPath);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
    if (!workspaceFolder) {
        return false;
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;
    const targetDir = isDirectory ? fsPath : path.dirname(fsPath);
    const ancestors = getAncestorDirectories(targetDir, workspaceRoot);
    const basename = path.basename(fsPath);
    let ignored = false;

    for (const directory of ancestors) {
        const gitignorePath = path.join(directory, '.gitignore');
        let content: string;
        try {
            content = await fs.readFile(gitignorePath, 'utf8');
        } catch {
            continue;
        }

        const rules = parseGitignoreRules(content);
        if (rules.length === 0) {
            continue;
        }

        const relativeToGitignore = path.relative(directory, fsPath);
        ignored = applyRules(relativeToGitignore, basename, isDirectory, rules, ignored);
    }

    return ignored;
}
