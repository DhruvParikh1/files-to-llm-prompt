import * as vscode from 'vscode';

export class PreviewPanel {
    public static currentPanel: PreviewPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getWebviewContent();
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
            type: 'update',
            content: content
        });
    }

    private _getWebviewContent() {
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
                    }
                    #preview {
                        white-space: pre-wrap;
                        font-family: var(--vscode-editor-font-family);
                        padding: 10px;
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
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
                        border-radius: 2px;
                        cursor: pointer;
                    }
                    button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <div class="toolbar">
                    <button id="copyButton">Copy to Clipboard</button>
                    <button id="refreshButton">Refresh Preview</button>
                </div>
                <div id="preview">Preview content will appear here...</div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const preview = document.getElementById('preview');
                    
                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'update':
                                preview.textContent = message.content;
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
                        // Trigger content refresh
                        vscode.commands.executeCommand('files-to-llm-prompt.generatePrompt');
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