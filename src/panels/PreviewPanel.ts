import * as vscode from 'vscode';

export class PreviewPanel {
    public static currentPanel: PreviewPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _currentPreviewFiles: string[] = []; // Files used in current preview
    private _selectedFiles: string[] = [];       // Currently selected files

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getWebviewContent([]);
        this._setWebviewMessageListener(this._panel.webview);
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'filesToLlmPromptPreview',
            'Files to LLM Prompt Preview',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        PreviewPanel.currentPanel = new PreviewPanel(panel, extensionUri);
    }

    public updateContent(content: string) {
        this._currentPreviewFiles = [...this._selectedFiles];
        this._panel.webview.postMessage({
            type: 'updatePreviewContent',
            content: content
        });
        this.checkSyncStatus();
    }
    
    public updateFileList(files: string[]) {
        this._selectedFiles = files;
        this._panel.webview.postMessage({
            type: 'updateFileList',
            files: files
        });
        this.checkSyncStatus();
    }

    public updateAvailableFiles(files: string[]) {
        this._panel.webview.postMessage({
            type: 'updateAvailableFiles',
            files: files
        });
    }
    
    private checkSyncStatus() {
        const isInSync = 
            this._currentPreviewFiles.length === this._selectedFiles.length &&
            this._currentPreviewFiles.every(file => this._selectedFiles.includes(file)) &&
            this._selectedFiles.every(file => this._currentPreviewFiles.includes(file));
    
        this._panel.webview.postMessage({
            type: 'updateSyncStatus',
            isInSync: isInSync
        });
    }

    private _getWebviewContent(files: string[]) {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Files to LLM Prompt Preview</title>
                <style>
                    body { 
                        padding: 20px; 
                        color: var(--vscode-editor-foreground);
                        font-family: var(--vscode-editor-font-family);
                        background-color: var(--vscode-editor-background);
                        display: grid;
                        grid-template-columns: 300px 1fr;
                        gap: 20px;
                        height: 100vh;
                        margin: 0;
                        box-sizing: border-box;
                    }
                    .search-container {
                        position: relative;
                        margin-bottom: 10px;
                    }
                    .search-input {
                        width: 100%;
                        padding: 6px 8px;
                        border: 1px solid var(--vscode-input-border);
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 4px;
                        outline: none;
                        font-family: var(--vscode-font-family);
                    }
                    .search-input:focus {
                        border-color: var(--vscode-focusBorder);
                    }
                    .search-results {
                        display: none;
                        position: absolute;
                        top: 100%;
                        left: 0;
                        right: 0;
                        background: var(--vscode-dropdown-background);
                        border: 1px solid var(--vscode-dropdown-border);
                        border-radius: 4px;
                        max-height: 200px;
                        overflow-y: auto;
                        z-index: 1000;
                    }
                    .search-results.visible {
                        display: block;
                    }
                    .search-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 6px 8px;
                        cursor: pointer;
                        border-bottom: 1px solid var(--vscode-dropdown-border);
                    }
                    .search-item:last-child {
                        border-bottom: none;
                    }
                    .search-item:hover {
                        background: var(--vscode-list-hoverBackground);
                    }
                    .search-item-name {
                        flex: 1;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        margin-right: 8px;
                    }
                    .add-file-btn {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 2px 8px;
                        border-radius: 3px;
                        cursor: pointer;
                    }
                    .add-file-btn:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .file-list-container {
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 10px;
                        display: flex;
                        flex-direction: column;
                        height: calc(100vh - 40px);
                    }
                    .file-list-header {
                        font-weight: bold;
                        margin-bottom: 10px;
                        padding: 5px;
                        background: var(--vscode-editor-lineHighlightBackground);
                        border-radius: 3px;
                    }
                    .file-list {
                        flex: 1;
                        overflow-y: auto;
                        margin-bottom: 10px;
                    }
                    .file-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 5px 8px;
                        margin: 2px 0;
                        border-radius: 3px;
                        background: var(--vscode-list-hoverBackground);
                    }
                    .file-item:hover {
                        background: var(--vscode-list-activeSelectionBackground);
                    }
                    .file-name {
                        flex: 1;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        margin-right: 8px;
                        font-family: var(--vscode-editor-font-family);
                        color: var(--vscode-foreground);
                    }
                    .remove-file {
                        flex-shrink: 0;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 2px 8px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 0.9em;
                    }
                    .remove-file:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .preview-container {
                        display: flex;
                        flex-direction: column;
                        height: calc(100vh - 40px);
                    }
                    .toolbar {
                        margin-bottom: 10px;
                        display: flex;
                        gap: 10px;
                    }
                    button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 6px 12px;
                        border-radius: 3px;
                        cursor: pointer;
                    }
                    button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    #preview {
                        flex: 1;
                        white-space: pre-wrap;
                        font-family: var(--vscode-editor-font-family);
                        padding: 10px;
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        overflow-y: auto;
                    }
                    .file-count {
                        font-size: 0.9em;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 5px;
                    }
                    .warning-message {
                        display: none;
                        color: var(--vscode-editorWarning-foreground);
                        font-size: 0.9em;
                        padding: 4px 8px;
                        border-radius: 3px;
                        margin-left: 10px;
                        align-items: center;
                        background: var(--vscode-editorWarning-background, rgba(255, 180, 0, 0.1));
                    }
                    .warning-message.visible {
                        display: flex;
                    }
                    .warning-icon {
                        margin-right: 6px;
                    }
                </style>
            </head>
            <body>
                <div class="file-list-container">
                    <div class="search-container">
                        <input type="text" 
                               class="search-input" 
                               id="fileSearch" 
                               placeholder="Search for files...">
                        <div class="search-results" id="searchResults"></div>
                    </div>
                    <div class="file-list-header">Selected Files</div>
                    <div class="file-list" id="fileList"></div>
                    <div class="file-count" id="fileCount"></div>
                </div>
                <div class="preview-container">
                    <div class="toolbar">
                        <button id="copyButton">Copy to Clipboard</button>
                        <button id="refreshButton">Refresh Preview</button>
                        <div id="syncWarning" class="warning-message">
                            <span class="warning-icon">⚠️</span>
                            Preview is out of sync with selected files. Click 'Refresh Preview' to update.
                        </div>
                    </div>
                    <div id="preview">Preview content will appear here... Select a file to continue...</div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const preview = document.getElementById('preview');
                    const fileList = document.getElementById('fileList');
                    const fileCount = document.getElementById('fileCount');
                    let selectedFiles = ${JSON.stringify(files)};

                    function updateFileCountDisplay() {
                        fileCount.textContent = \`\${selectedFiles.length} file\${selectedFiles.length === 1 ? '' : 's'} selected\`;
                    }

                    function formatFilePath(fullPath) {
                        const normalizedPath = fullPath.replace(/\\\\/g, '/');
                        const parts = normalizedPath.split('/');
                        const fileName = parts[parts.length - 1];
                        return '.../' + fileName;
                    }

                    function renderFileList() {
                        fileList.innerHTML = selectedFiles.map(file => {
                            const formattedPath = formatFilePath(file);
                            return '<div class="file-item">' +
                                '<span class="file-name" title="' + file + '">' + formattedPath + '</span>' +
                                '<button class="remove-file" data-file="' + file + '">Remove</button>' +
                                '</div>';
                        }).join('');
                        updateFileCountDisplay();

                        document.querySelectorAll('.remove-file').forEach(button => {
                            button.addEventListener('click', (e) => {
                                const file = e.target.dataset.file;
                                vscode.postMessage({ 
                                    type: 'removeFile', 
                                    file: file 
                                });
                            });
                        });
                    }

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'updatePreviewContent':
                                preview.textContent = message.content;
                                break;
                            case 'updateFileList':
                                selectedFiles = message.files;
                                renderFileList();
                                break;
                            case 'updateAvailableFiles':
                                debugLog(\`Received \${message.files.length} available files\`);
                                availableFiles = message.files;
                                break;
                            case 'searchResults':
                                const filteredFiles = message.files.filter(file => 
                                    !selectedFiles.includes(file)
                                );
                                debugLog('Received ' + filteredFiles.length + ' search results');

                                if (filteredFiles.length > 0) {
                                    searchResults.innerHTML = filteredFiles
                                        .map(file => 
                                            '<div class="search-item">' +
                                                '<span class="search-item-name" title="' + file + '">' + formatFilePath(file) + '</span>' +
                                                '<button class="add-file-btn" data-file="' + file + '">Add</button>' +
                                            '</div>'
                                        ).join('');
                                    searchResults.classList.add('visible');
                                } else {
                                    searchResults.innerHTML = '<div class="search-item">No matches found</div>';
                                    searchResults.classList.add('visible');
                                }
                                break;
                            case 'updateSyncStatus':
                                const warningElement = document.getElementById('syncWarning');
                                if (!message.isInSync) {
                                    warningElement.classList.add('visible');
                                } else {
                                    warningElement.classList.remove('visible');
                                }
                                break;
                        }
                    });

                    // Copy button handler
                    document.getElementById('copyButton').addEventListener('click', () => {
                        navigator.clipboard.writeText(preview.textContent)
                            .then(() => {
                                vscode.postMessage({ type: 'info', message: 'Content copied to clipboard' });
                            })
                            .catch(err => {
                                vscode.postMessage({ type: 'error', message: 'Failed to copy content' });
                            });
                    });

                    // Refresh button handler
                    document.getElementById('refreshButton').addEventListener('click', () => {
                        vscode.postMessage({ type: 'refresh' });
                    });

                    // Search functionality
                    const searchInput = document.getElementById('fileSearch');
                    const searchResults = document.getElementById('searchResults');
                    let availableFiles = []; // Will be populated from extension

                    // Debug logging function
                    function debugLog(message) {
                        vscode.postMessage({ 
                            type: 'debug', 
                            message: \`Search Debug: \${message}\` 
                        });
                    }

                    async function updateSearchResults(searchTerm) {
                        if (!searchTerm.trim()) {
                            searchResults.classList.remove('visible');
                            return;
                        }

                        try {
                            // Request search from extension
                            vscode.postMessage({ 
                                type: 'searchFiles', 
                                searchTerm: searchTerm 
                            });
                        } catch (error) {
                        }
                    }

                    // Handle search input
                    let debounceTimeout;
                    searchInput.addEventListener('input', (e) => {
                        debugLog('Search input changed');
                        clearTimeout(debounceTimeout);
                        debounceTimeout = setTimeout(() => {
                            updateSearchResults(e.target.value);
                        }, 300);
                    });

                    // Handle clicking outside of search results
                    document.addEventListener('click', (e) => {
                        if (!searchResults.contains(e.target) && 
                            e.target !== searchInput) {
                            searchResults.classList.remove('visible');
                        }
                    });

                    // Handle search result clicks
                    searchResults.addEventListener('click', (e) => {
                        const addButton = e.target.closest('.add-file-btn');
                        if (addButton) {
                            const file = addButton.dataset.file;
                            debugLog('Adding file: ' + file);
                            vscode.postMessage({ 
                                type: 'addFile', 
                                file: file 
                            });
                            searchInput.value = '';
                            searchResults.classList.remove('visible');
                        }
                    });

                    // Focus handling
                    searchInput.addEventListener('focus', () => {
                        if (searchInput.value.trim()) {
                            updateSearchResults(searchInput.value);
                        }
                    });

                    // Initial render
                    renderFileList();
                </script>
            </body>
            </html>`;
    }

    private _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'info':
                        vscode.window.showInformationMessage(message.message);
                        break;
                    case 'error':
                        vscode.window.showErrorMessage(message.message);
                        break;
                    case 'debug':
                        console.log(message.message); // For debugging search functionality
                        break;
                    case 'refresh':
                        vscode.commands.executeCommand('files-to-llm-prompt.generatePrompt');
                        break;
                    case 'removeFile':
                        vscode.commands.executeCommand('files-to-llm-prompt.toggleFile', message.file);
                        break;
                    case 'addFile':
                        vscode.commands.executeCommand('files-to-llm-prompt.toggleFile', message.file);
                        break;
                    case 'searchFiles':
                        const files = await vscode.commands.executeCommand(
                            'files-to-llm-prompt.searchFiles',
                            message.searchTerm
                        );
                        webview.postMessage({
                            type: 'searchResults',
                            files: files
                        });
                        break;
                }
            },
            undefined,
            this._disposables
        );
    }

    public dispose() {
        PreviewPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}