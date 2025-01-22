import * as vscode from 'vscode';
import * as path from 'path';

export class FileExplorerProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> = new vscode.EventEmitter<FileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private selectedFiles: Set<string> = new Set();
    private allFiles: Set<string> = new Set();
    private fileToDirectoryMap: Map<string, string> = new Map(); // Maps files to their parent directory
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
            treeDataProvider: this
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
                            this.selectedFiles,
                            this.isDirectorySelected.bind(this)
                        );
                        
                        // Track files and their parent directories
                        if (type === vscode.FileType.File) {
                            this.allFiles.add(uri.fsPath);
                            this.fileToDirectoryMap.set(uri.fsPath, element.resourceUri.fsPath);
                        }

                        return item;
                    })
            );

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
        
        if (!includeHidden && name.startsWith('.')) {
            return false;
        }

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

    private isDirectorySelected(directoryPath: string): boolean {
        // Get all files that are children of this directory
        const childFiles = Array.from(this.allFiles)
            .filter(filePath => this.fileToDirectoryMap.get(filePath) === directoryPath);
        
        // Directory is selected if it has files and all of them are selected
        return childFiles.length > 0 && childFiles.every(file => this.selectedFiles.has(file));
    }

    private async toggleFileSelection(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const statResult = await vscode.workspace.fs.stat(uri);
            const isDirectory = statResult.type === vscode.FileType.Directory;
            
            if (isDirectory) {
                const files = await this.getAllFilesInDirectory(uri);
                const allSelected = this.isDirectorySelected(filePath);
                
                if (allSelected) {
                    // Deselect all files in directory
                    files.forEach(file => this.selectedFiles.delete(file));
                } else {
                    // Select all files in directory
                    files.forEach(file => this.selectedFiles.add(file));
                }
            } else {
                const isSelected = this.selectedFiles.has(filePath);
                if (isSelected) {
                    this.selectedFiles.delete(filePath);
                } else {
                    this.selectedFiles.add(filePath);
                }
            }
            
            console.log(`Toggled selection for ${filePath}. Currently selected files:`, Array.from(this.selectedFiles));
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
        console.log('Currently selected files:', Array.from(this.selectedFiles));
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
        
        this.tooltip = this.label;
        const relativePath = path.relative(
            vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
            resourceUri.fsPath
        );
        
        

        if (contextValue === 'file') {
            this.iconPath = new vscode.ThemeIcon('file');
        } else if (contextValue === 'folder') {
            this.iconPath = new vscode.ThemeIcon('folder');
        }
        
        // Add command for item click
        this.command = {
            title: 'Toggle Selection',
            command: 'files-to-llm-prompt.toggleFile',
            arguments: [resourceUri.fsPath]
        };

        // Only show checkbox if item is selected
        const isSelected = contextValue === 'file' 
            ? selectedFiles.has(resourceUri.fsPath)
            : this.isDirectorySelected(resourceUri.fsPath);

        if (isSelected) {
            this.checkboxState = {
                state: vscode.TreeItemCheckboxState.Checked,
                tooltip: 'Selected (click name to deselect)'
            };
        }

        this.description = isSelected 
            ? `${relativePath} (Selected)` 
            : relativePath;
        // No else clause - we don't set checkboxState at all if not selected
    }
}