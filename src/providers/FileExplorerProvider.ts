import * as vscode from 'vscode';
import * as path from 'path';

export class FileExplorerProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> = new vscode.EventEmitter<FileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private selectedFiles: Set<string> = new Set();
    private allFiles: Set<string> = new Set();
    private treeView?: vscode.TreeView<FileItem>;

    constructor(private context: vscode.ExtensionContext) {
        // Register the toggle command for both files and directories
        context.subscriptions.push(
            vscode.commands.registerCommand('files-to-llm-prompt.toggleFile', async (filePath: string) => {
                await this.toggleFileSelection(filePath);
            })
        );

        // Create and store the TreeView
        this.treeView = vscode.window.createTreeView('files-to-llm-prompt-explorer', {
            treeDataProvider: this,
            canSelectMany: true
        });

        // Handle checkbox state changes
        this.treeView.onDidChangeCheckboxState(async (e) => {
            for (const [item, checkboxState] of e.items) {
                if (item.resourceUri) {
                    const filePath = item.resourceUri.fsPath;
                    const statResult = await vscode.workspace.fs.stat(item.resourceUri);
                    const isDirectory = statResult.type === vscode.FileType.Directory;

                    if (checkboxState === vscode.TreeItemCheckboxState.Checked) {
                        if (isDirectory) {
                            const files = await this.getAllFilesInDirectory(item.resourceUri);
                            files.forEach(file => this.selectedFiles.add(file));
                        } else {
                            this.selectedFiles.add(filePath);
                        }
                        console.log(`Selected: ${filePath}`);
                    } else {
                        if (isDirectory) {
                            const files = await this.getAllFilesInDirectory(item.resourceUri);
                            files.forEach(file => this.selectedFiles.delete(file));
                        } else {
                            this.selectedFiles.delete(filePath);
                        }
                        console.log(`Deselected: ${filePath}`);
                    }
                }
            }
            console.log('Current selected files:', this.selectedFiles);
            this.refresh();
        });

        // Register select all command
        context.subscriptions.push(
            vscode.commands.registerCommand('files-to-llm-prompt.selectAll', () => {
                this.selectAll();
            })
        );

        // Register deselect all command
        context.subscriptions.push(
            vscode.commands.registerCommand('files-to-llm-prompt.deselectAll', () => {
                this.deselectAll();
            })
        );

        context.subscriptions.push(this.treeView);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
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
                    this.selectedFiles
                );
                return item;
            });
        }

        try {
            const children = await vscode.workspace.fs.readDirectory(element.resourceUri);
            const items = await Promise.all(
                children
                    .filter(([name, type]) => this.shouldInclude(name, type === vscode.FileType.Directory))
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
                            this.selectedFiles
                        );
                        
                        // Track files for select all functionality
                        if (type === vscode.FileType.File) {
                            this.allFiles.add(uri.fsPath);
                        }

                        return item;
                    })
            );

            // Sort items: folders first, then files, both alphabetically
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

    private shouldInclude(name: string, isDirectory: boolean): boolean {
        const config = vscode.workspace.getConfiguration('files-to-llm-prompt');
        const includeHidden = config.get<boolean>('includeHidden');
        const ignorePatterns = config.get<string[]>('ignorePatterns') || [];
        
        // Check for hidden files/folders
        if (!includeHidden && name.startsWith('.')) {
            return false;
        }

        // Check ignore patterns
        for (const pattern of ignorePatterns) {
            try {
                if (new RegExp(pattern).test(name)) {
                    return false;
                }
            } catch (error) {
                console.error(`Invalid ignore pattern: ${pattern}`);
            }
        }
        
        return true;
    }

    private async getAllFilesInDirectory(uri: vscode.Uri): Promise<string[]> {
        const files: string[] = [];
        
        try {
            const entries = await vscode.workspace.fs.readDirectory(uri);
            for (const [name, type] of entries) {
                const entryUri = vscode.Uri.joinPath(uri, name);
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

    private async toggleFileSelection(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const statResult = await vscode.workspace.fs.stat(uri);
            const isDirectory = statResult.type === vscode.FileType.Directory;
            
            const isCurrentlySelected = this.selectedFiles.has(filePath);
            
            if (isDirectory) {
                const files = await this.getAllFilesInDirectory(uri);
                if (isCurrentlySelected) {
                    files.forEach(file => this.selectedFiles.delete(file));
                } else {
                    files.forEach(file => this.selectedFiles.add(file));
                }
            } else {
                if (isCurrentlySelected) {
                    this.selectedFiles.delete(filePath);
                } else {
                    this.selectedFiles.add(filePath);
                }
            }
            
            console.log(`Toggled selection for ${filePath}. Currently selected files:`, this.selectedFiles);
            this.refresh();
        } catch (error) {
            console.error(`Error toggling file selection: ${error}`);
        }
    }

    selectAll(): void {
        this.allFiles.forEach(filePath => {
            this.selectedFiles.add(filePath);
        });
        this.refresh();
        vscode.window.showInformationMessage(`Selected ${this.selectedFiles.size} files`);
    }

    deselectAll(): void {
        const previousCount = this.selectedFiles.size;
        this.selectedFiles.clear();
        this.refresh();
        vscode.window.showInformationMessage(`Deselected ${previousCount} files`);
    }

    getSelectedFiles(): string[] {
        console.log('Currently selected files:', this.selectedFiles);
        return Array.from(this.selectedFiles);
    }
}

class FileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly resourceUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        private selectedFiles: Set<string>
    ) {
        super(label, collapsibleState);
        
        this.tooltip = this.label;
        this.description = path.relative(
            vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
            resourceUri.fsPath
        );

        // Add icon based on type
        if (contextValue === 'file') {
            this.iconPath = new vscode.ThemeIcon('file');
        } else if (contextValue === 'folder') {
            this.iconPath = new vscode.ThemeIcon('folder');
        }
        
        // Initialize checkbox state based on selection
        this.checkboxState = {
            state: this.selectedFiles.has(resourceUri.fsPath)
                ? vscode.TreeItemCheckboxState.Checked
                : vscode.TreeItemCheckboxState.Unchecked,
            tooltip: `Select ${contextValue === 'folder' ? 'all files in folder' : 'file'}`
        };

        // Add command for item click
        this.command = {
            title: 'Toggle Selection',
            command: 'files-to-llm-prompt.toggleFile',
            arguments: [resourceUri.fsPath]
        };
    }
}