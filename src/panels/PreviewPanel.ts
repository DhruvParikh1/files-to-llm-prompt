import * as vscode from 'vscode';

export class PreviewPanel {
    public static currentPanel: PreviewPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _selectedFiles: string[] = [];

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
        this._panel.webview.postMessage({
            type: 'updatePreviewContent',
            content: content
        });
    }

    public updateFileList(files: string[]) {
        console.log('PreviewPanel received file list update:', files);
        this._selectedFiles = files;
        this._panel.webview.postMessage({
            type: 'updateFileList',
            files: files
        });
        console.log('Sent file list to webview');
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
                        padding: 5px;
                        margin: 2px 0;
                        border-radius: 3px;
                    }
                    .file-item:hover {
                        background: var(--vscode-list-hoverBackground);
                    }
                    .file-name {
                        flex: 1;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        margin-right: 8px;
                    }
                    .remove-file {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 2px 6px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 0.8em;
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
                </style>
            </head>
            <body>
                <div class="file-list-container">
                    <div class="file-list-header">Selected Files</div>
                    <div class="file-list" id="fileList"></div>
                    <div class="file-count" id="fileCount"></div>
                </div>
                <div class="preview-container">
                    <div class="toolbar">
                        <button id="copyButton">Copy to Clipboard</button>
                        <button id="refreshButton">Refresh Preview</button>
                    </div>
                    <div id="preview">Preview content will appear here...</div>
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

                    function renderFileList() {
                        fileList.innerHTML = selectedFiles.map(file => {
                            const fileName = file.split('/').pop();
                            return \`
                                <div class="file-item">
                                    <span class="file-name" title="\${file}">\${fileName}</span>
                                    <button class="remove-file" data-file="\${file}">Remove</button>
                                </div>
                            \`;
                        }).join('');
                        updateFileCountDisplay();

                        // Add event listeners to remove buttons
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
                        console.log('Webview received message:', message);
                        switch (message.type) {
                            case 'updatePreviewContent':
                                preview.textContent = message.content;
                                break;
                            case 'updateFileList':
                                console.log('Updating file list with:', message.files);
                                selectedFiles = message.files;
                                renderFileList();
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
                    case 'refresh':
                        vscode.commands.executeCommand('files-to-llm-prompt.generatePrompt');
                        break;
                    case 'removeFile':
                        vscode.commands.executeCommand('files-to-llm-prompt.toggleFile', message.file);
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