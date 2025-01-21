import * as vscode from 'vscode';
import * as path from 'path';

export class FileExplorerProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> = new vscode.EventEmitter<FileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private selectedFiles: Set<string> = new Set();
    private allFiles: Set<string> = new Set();

    constructor(private context: vscode.ExtensionContext) {
        // Register the toggle command
        context.subscriptions.push(
            vscode.commands.registerCommand('files-to-llm-prompt.toggleFile', (filePath: string) => {
                this.toggleFileSelection(filePath);
            })
        );

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
            return workspaceFolders.map(folder => new FileItem(
                folder.name,
                folder.uri,
                vscode.TreeItemCollapsibleState.Collapsed,
                'workspace-folder'
            ));
        }

        try {
            const children = await vscode.workspace.fs.readDirectory(element.resourceUri);
            const items = children
                .filter(([name, type]) => this.shouldInclude(name, type === vscode.FileType.Directory))
                .map(([name, type]) => {
                    const uri = vscode.Uri.joinPath(element.resourceUri, name);
                    const collapsibleState = type === vscode.FileType.Directory
                        ? vscode.TreeItemCollapsibleState.Collapsed
                        : vscode.TreeItemCollapsibleState.None;
                    
                    const item = new FileItem(
                        name,
                        uri,
                        collapsibleState,
                        type === vscode.FileType.Directory ? 'folder' : 'file'
                    );

                    // Add checkbox for files
                    if (type === vscode.FileType.File) {
                        this.allFiles.add(uri.fsPath);  // Track all available files
                        item.checkboxState = {
                            state: this.selectedFiles.has(uri.fsPath) 
                                ? vscode.TreeItemCheckboxState.Checked 
                                : vscode.TreeItemCheckboxState.Unchecked
                        };
                        item.command = {
                            command: 'files-to-llm-prompt.toggleFile',
                            title: 'Toggle File Selection',
                            arguments: [uri.fsPath]
                        };
                    }

                    return item;
                })
                .sort((a, b) => {
                    if (a.contextValue === b.contextValue) {
                        return a.label!.localeCompare(b.label!);
                    }
                    return a.contextValue === 'folder' ? -1 : 1;
                });

            return items;
        } catch (error) {
            console.error(error);
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

    toggleFileSelection(filePath: string): void {
        if (this.selectedFiles.has(filePath)) {
            this.selectedFiles.delete(filePath);
        } else {
            this.selectedFiles.add(filePath);
        }
        this.refresh();
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
        return Array.from(this.selectedFiles);
    }
}

class FileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly resourceUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string
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
    }
}