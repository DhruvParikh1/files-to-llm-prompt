import * as vscode from 'vscode';
import * as path from 'path';
import { PreviewPanel } from '../panels/PreviewPanel';
import { search } from 'fast-fuzzy';

export class FileExplorerProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> = new vscode.EventEmitter<FileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private selectedFiles: Set<string> = new Set();
    private allFiles: Set<string> = new Set();
    private fileToDirectoryMap: Map<string, string> = new Map();
    private treeView?: vscode.TreeView<FileItem>;
    private debugLogger: vscode.OutputChannel;

    constructor(private context: vscode.ExtensionContext) {
        // Create debug output channel
        this.debugLogger = vscode.window.createOutputChannel("Files-to-LLM Debug");
        
        // Listen for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('files-to-llm-prompt')) {
                    this.debugLogger.appendLine('\n=== Configuration Changed ===');
                    const config = vscode.workspace.getConfiguration('files-to-llm-prompt');
                    this.debugLogger.appendLine(`New config: ${JSON.stringify(config, null, 2)}`);
                    this.refresh();
                }
            })
        );
        
        context.subscriptions.push(
            vscode.commands.registerCommand('files-to-llm-prompt.toggleFile', async (filePath: string) => {
                await this.toggleFileSelection(filePath);
            })
        );

        this.treeView = vscode.window.createTreeView('files-to-llm-prompt-explorer', {
            treeDataProvider: this
        });

        context.subscriptions.push(
            vscode.commands.registerCommand('files-to-llm-prompt.selectAll', () => {
                this.selectAll();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('files-to-llm-prompt.deselectAll', () => {
                this.deselectAll();
            })
        );

        context.subscriptions.push(this.treeView);
        
        // Log initial configuration
        const initialConfig = vscode.workspace.getConfiguration('files-to-llm-prompt');
        this.debugLogger.appendLine('\n=== Initial Configuration ===');
        this.debugLogger.appendLine(`Config: ${JSON.stringify(initialConfig, null, 2)}`);
    }

    public getAllFiles(): string[] {
        return Array.from(this.allFiles);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();

        // Update preview panel with available files if it exists
        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel.updateAvailableFiles(this.getAllFiles());
        }
    }

    getTreeItem(element: FileItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: FileItem): Promise<FileItem[]> {
        if (!element) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return [];
            }
            return workspaceFolders.map(folder => {
                const item = new FileItem(
                    folder.name,
                    folder.uri,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'workspace-folder',
                    this.selectedFiles,
                    this.isDirectorySelected.bind(this)
                );
                return item;
            });
        }

        try {
            const children = await vscode.workspace.fs.readDirectory(element.resourceUri);
            const items = await Promise.all(
                children
                    .filter(([name, type]) => {
                        if (!this.shouldInclude(name, type === vscode.FileType.Directory, element.resourceUri)) {
                            return false;
                        }
                        return true;
                    })
                    .map(async ([name, type]) => {
                        const uri = vscode.Uri.joinPath(element.resourceUri, name);
                        const collapsibleState = type === vscode.FileType.Directory
                            ? vscode.TreeItemCollapsibleState.Collapsed
                            : vscode.TreeItemCollapsibleState.None;
                        
                        const item = new FileItem(
                            name,
                            uri,
                            collapsibleState,
                            type === vscode.FileType.Directory ? 'folder' : 'file',
                            this.selectedFiles,
                            this.isDirectorySelected.bind(this)
                        );
                        
                        if (type === vscode.FileType.File) {
                            const shouldAdd = this.shouldInclude(name, false, element.resourceUri);
                            if (shouldAdd) {
                                this.allFiles.add(uri.fsPath);
                                this.fileToDirectoryMap.set(uri.fsPath, element.resourceUri.fsPath);
                            }
                        }

                        return item;
                    })
            );

            // After processing all children, update PreviewPanel
            if (PreviewPanel.currentPanel) {
                PreviewPanel.currentPanel.updateAvailableFiles(this.getAllFiles());
            }

            return items.sort((a, b) => {
                if (a.contextValue === b.contextValue) {
                    return a.label!.localeCompare(b.label!);
                }
                return a.contextValue === 'folder' ? -1 : 1;
            });
        } catch (error) {
            console.error('Error getting children:', error);
            return [];
        }
    }

    private shouldInclude(name: string, isDirectory: boolean, parentUri: vscode.Uri): boolean {
        const config = vscode.workspace.getConfiguration('files-to-llm-prompt');
        const includeHidden = config.get<boolean>('includeHidden');
        const ignorePatterns = config.get<string[]>('ignorePatterns') || [];
        const includeDirectories = config.get<boolean>('includeDirectories');
        const overrideGitignore = config.get<boolean>('overrideGitignore');
        
        this.debugLogger.appendLine(`\n=== Checking shouldInclude ===`);
        this.debugLogger.appendLine(`Name: ${name}`);
        this.debugLogger.appendLine(`Is Directory: ${isDirectory}`);
        this.debugLogger.appendLine(`Parent Path: ${parentUri.fsPath}`);
        this.debugLogger.appendLine(`Include Hidden: ${includeHidden}`);
        this.debugLogger.appendLine(`Include Directories: ${includeDirectories}`);
        this.debugLogger.appendLine(`Override Gitignore: ${overrideGitignore}`);
        this.debugLogger.appendLine(`Ignore Patterns: ${JSON.stringify(ignorePatterns)}`);
        
        // Check for hidden files/folders
        if (!includeHidden && name.startsWith('.')) {
            this.debugLogger.appendLine(`Excluded: Hidden file/folder`);
            return false;
        }

        // Handle directory filtering
        if (isDirectory) {
            this.debugLogger.appendLine(`Checking directory: ${name}`);
            if (!includeDirectories) {
                this.debugLogger.appendLine(`Directory filtering disabled - showing directory`);
                return true;
            }

            // If we get here, directory filtering is enabled
            this.debugLogger.appendLine(`Directory filtering enabled - checking patterns`);
            
            // Check for exact matches first
            for (const pattern of ignorePatterns) {
                const trimmed = pattern.trim();
                if (!trimmed) {continue;}
                
                this.debugLogger.appendLine(`Checking exact match with pattern: "${trimmed}"`);
                if (name === trimmed) {
                    this.debugLogger.appendLine(`Directory "${name}" exactly matches pattern "${trimmed}" - excluding`);
                    return false;
                }
            }
            
            // If no exact matches found and it's a directory, we'll let it through
            // to allow showing its contents (which will be filtered individually)
            this.debugLogger.appendLine(`No exact directory matches - allowing directory to show contents`);
            return true;
        }

        // Process ignore patterns
        for (const pattern of ignorePatterns) {
            try {
                // Skip empty patterns
                if (!pattern.trim()) {
                    continue;
                }

                this.debugLogger.appendLine(`\nChecking pattern: "${pattern}"`);

                // Special handling for simple directory/file names without glob patterns
                if (!pattern.includes('*') && !pattern.includes('?') && !pattern.includes('/')) {
                    this.debugLogger.appendLine(`Simple pattern match check: "${name}" === "${pattern}"`);
                    if (name === pattern) {
                        this.debugLogger.appendLine(`Excluded: Exact match with simple pattern`);
                        return false;
                    }
                    continue;
                }

                // Convert glob pattern to regex
                const globToRegex = (glob: string): string => {
                    const processed = glob
                        .replace(/\\/g, '/')
                        .replace(/\./g, '\\.')
                        .replace(/\*\*/g, '{{GLOBSTAR}}')
                        .replace(/\*/g, '[^/]*')
                        .replace(/\?/g, '[^/]')
                        .replace(/{{GLOBSTAR}}/g, '.*')
                        .replace(/\[([^\]]+)\]/g, '[$1]')
                        .replace(/\//g, '\\/');
                    this.debugLogger.appendLine(`Converted glob "${glob}" to regex: "${processed}"`);
                    return processed;
                };

                const basePattern = globToRegex(pattern);
                const regex = new RegExp(`(^|/)${basePattern}(/|$)`);
                this.debugLogger.appendLine(`Final regex: ${regex}`);

                // Handle relative paths for better matching
                const relativePath = path.relative(
                    vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
                    path.join(parentUri.fsPath, name)
                ).replace(/\\/g, '/');

                this.debugLogger.appendLine(`Testing against relativePath: "${relativePath}"`);
                
                if (regex.test(name)) {
                    this.debugLogger.appendLine(`Excluded: Pattern matched name`);
                    return false;
                }
                
                if (regex.test(relativePath)) {
                    this.debugLogger.appendLine(`Excluded: Pattern matched relative path`);
                    return false;
                }
            } catch (error) {
                this.debugLogger.appendLine(`Error processing pattern "${pattern}": ${error}`);
                console.error(`Invalid ignore pattern: ${pattern}`, error);
            }
        }

        if (!overrideGitignore) {
            // Add .gitignore checking logic here if needed
        }
        
        this.debugLogger.appendLine(`Included: Passed all checks`);
        return true;
    }

    private async getAllFilesInDirectory(uri: vscode.Uri): Promise<string[]> {
        const files: string[] = [];
        
        try {
            const entries = await vscode.workspace.fs.readDirectory(uri);
            for (const [name, type] of entries) {
                const entryUri = vscode.Uri.joinPath(uri, name);
                
                if (!this.shouldInclude(name, type === vscode.FileType.Directory, uri)) {
                    continue;
                }

                if (type === vscode.FileType.Directory) {
                    files.push(...await this.getAllFilesInDirectory(entryUri));
                } else if (type === vscode.FileType.File) {
                    files.push(entryUri.fsPath);
                }
            }
        } catch (error) {
            console.error(`Error reading directory: ${error}`);
        }
        
        return files;
    }

    private isDirectorySelected(directoryPath: string): boolean {
        const childFiles = Array.from(this.allFiles)
            .filter(filePath => this.fileToDirectoryMap.get(filePath) === directoryPath);
        
        return childFiles.length > 0 && childFiles.every(file => this.selectedFiles.has(file));
    }

    public async searchWorkspaceFiles(searchTerm: string): Promise<string[]> {
        try {
            const config = vscode.workspace.getConfiguration('files-to-llm-prompt');
            const fuzzyThreshold = config.get<number>('fuzzySearchThreshold') || 0.6;

            // If search term is empty, return recent files
            if (!searchTerm.trim()) {
                return Array.from(this.allFiles).slice(0, 10);
            }

            // First, get workspace-wide matches using VS Code search
            const workspaceResults = await vscode.workspace.findFiles(
                `**/${searchTerm}*`,
                '**/node_modules/**',
                20 // Increased limit slightly
            );

            // Add these to our allFiles set
            workspaceResults.forEach(uri => this.allFiles.add(uri.fsPath));

            // Get all available files including new ones
            const allFiles = Array.from(this.allFiles);

            // Prepare data for fuzzy search
            const searchData = allFiles.map(filePath => ({
                filePath,
                searchString: path.basename(filePath)
            }));

            // Perform fuzzy search
            const results = search(searchTerm, searchData, {
                keySelector: (item: { filePath: string; searchString: string }) => item.searchString,
                threshold: fuzzyThreshold,
                returnMatchData: false
            });

            const matchedFiles = results.map(result => result.filePath);

            this.debugLogger.appendLine(`Fuzzy search for "${searchTerm}" found ${matchedFiles.length} matches`);
            return matchedFiles;

        } catch (error) {
            this.debugLogger.appendLine(`Error in fuzzy search: ${error}`);
            console.error('Error searching workspace:', error);
            return [];
        }
    }

    private notifyPreviewPanelOfChanges() {
        console.log('Attempting to notify preview panel...');
        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel.updateFileList(Array.from(this.selectedFiles));
            PreviewPanel.currentPanel.updateAvailableFiles(this.getAllFiles());
            console.log('Successfully sent file list to preview panel');
        } else {
            console.log('Preview panel not initialized yet');
        }
    }
    
    private async toggleFileSelection(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const statResult = await vscode.workspace.fs.stat(uri);
            const isDirectory = statResult.type === vscode.FileType.Directory;
            
            const wasSelected = isDirectory ? 
                this.isDirectorySelected(filePath) : 
                this.selectedFiles.has(filePath);
            
            if (isDirectory) {
                const files = await this.getAllFilesInDirectory(uri);
                if (wasSelected) {
                    files.forEach(file => this.selectedFiles.delete(file));
                } else {
                    files.forEach(file => this.selectedFiles.add(file));
                }
            } else {
                if (wasSelected) {
                    this.selectedFiles.delete(filePath);
                } else {
                    this.selectedFiles.add(filePath);
                }
            }
            
            this.refresh();
            this.notifyPreviewPanelOfChanges(); // Add this line
            
            const selectionCount = this.selectedFiles.size;
            const messageText = wasSelected ? 
                `Deselected ${isDirectory ? 'directory' : 'file'}. Total files selected: ${selectionCount}` :
                `Selected ${isDirectory ? 'directory' : 'file'}. Total files selected: ${selectionCount}`;
            vscode.window.setStatusBarMessage(messageText, 3000);
        } catch (error) {
            console.error(`Error toggling file selection: ${error}`);
            vscode.window.showErrorMessage(`Failed to toggle selection: ${error}`);
        }
    }

    selectAll(): void {
        this.allFiles.forEach(filePath => {
            this.selectedFiles.add(filePath);
        });
        this.refresh();
        this.notifyPreviewPanelOfChanges(); // Add this line
        vscode.window.showInformationMessage(`Selected ${this.selectedFiles.size} files`);
    }
    
    deselectAll(): void {
        const previousCount = this.selectedFiles.size;
        this.selectedFiles.clear();
        this.refresh();
        this.notifyPreviewPanelOfChanges(); // Add this line
        vscode.window.showInformationMessage(`Deselected ${previousCount} files`);
    }

    getSelectedFiles(): string[] {
        return Array.from(this.selectedFiles);
    }
}

class FileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly resourceUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        private selectedFiles: Set<string>,
        private isDirectorySelected: (dirPath: string) => boolean
    ) {
        super(label, collapsibleState);
        
        const isSelected = contextValue === 'file' 
            ? selectedFiles.has(resourceUri.fsPath)
            : this.isDirectorySelected(resourceUri.fsPath);

        this.tooltip = this.label;
        const relativePath = path.relative(
            vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
            resourceUri.fsPath
        );
        
        this.description = isSelected 
            ? `${relativePath} (Selected)` 
            : relativePath;

        if (contextValue === 'file') {
            this.iconPath = new vscode.ThemeIcon('file');
        } else if (contextValue === 'folder') {
            this.iconPath = new vscode.ThemeIcon('folder');
        }
        
        this.command = {
            title: 'Toggle Selection',
            command: 'files-to-llm-prompt.toggleFile',
            arguments: [resourceUri.fsPath]
        };

        if (isSelected) {
            this.checkboxState = {
                state: vscode.TreeItemCheckboxState.Checked,
                tooltip: 'Selected (click name to deselect)'
            };
        }
    }
}