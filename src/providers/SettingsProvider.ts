import * as vscode from 'vscode';

export class SettingsProvider implements vscode.WebviewViewProvider {
    // Change this line to match exactly the ID in package.json
    public static readonly viewType = 'files-to-llm-prompt-settings';

    private _view?: vscode.WebviewView;

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: []
        };

        webviewView.webview.html = this._getHtmlForWebview();
        this._setWebviewMessageListener(webviewView.webview);
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                // Refresh the view when it becomes visible
                webviewView.webview.html = this._getHtmlForWebview();
            }
        });
    }

    private _getHtmlForWebview() {
        const config = vscode.workspace.getConfiguration('files-to-llm-prompt');
        
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { 
                        padding: 10px; 
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                    }
                    .setting-item { 
                        margin-bottom: 15px; 
                        display: flex;
                        flex-direction: column;
                        padding: 8px;
                        border-radius: 4px;
                    }
                    .setting-item:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    .setting-item label { 
                        margin-bottom: 5px;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }
                    input[type="checkbox"] {
                        margin: 0;
                    }
                    select, textarea {
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        padding: 4px 8px;
                        margin-top: 4px;
                        border-radius: 2px;
                    }
                    select:focus, textarea:focus {
                        outline: 1px solid var(--vscode-focusBorder);
                        border-color: var(--vscode-focusBorder);
                    }
                    .description {
                        font-size: 0.9em;
                        opacity: 0.8;
                        margin-top: 4px;
                    }
                </style>
            </head>
            <body>
                <div class="setting-item">
                    <label>
                        <input type="checkbox" id="includeHidden" 
                            ${config.get('includeHidden') ? 'checked' : ''}>
                        Include Hidden Files
                    </label>
                    <div class="description">Show files and folders that begin with a dot (.)</div>
                </div>
                <div class="setting-item">
                    <label>
                        <input type="checkbox" id="includeDirectories" 
                            ${config.get('includeDirectories') ? 'checked' : ''}>
                        Include Directories
                    </label>
                    <div class="description">Include directories in pattern matching</div>
                </div>
                <div class="setting-item">
                    <label>
                        <input type="checkbox" id="ignoreGitignore" 
                            ${config.get('ignoreGitignore') ? 'checked' : ''}>
                        Ignore .gitignore Files
                    </label>
                    <div class="description">Do not use .gitignore rules when filtering files</div>
                </div>
                <div class="setting-item">
                    <label>Output Format</label>
                    <select id="outputFormat">
                        <option value="default" ${config.get('outputFormat') === 'default' ? 'selected' : ''}>
                            Default
                        </option>
                        <option value="claude-xml" ${config.get('outputFormat') === 'claude-xml' ? 'selected' : ''}>
                            Claude XML
                        </option>
                    </select>
                    <div class="description">Choose the format for the generated prompt</div>
                </div>
                <div class="setting-item">
                    <label>Ignore Patterns</label>
                    <textarea id="ignorePatterns" rows="4" style="width: 100%">${(config.get<string[]>('ignorePatterns') || []).join('\n')}</textarea>
                    <div class="description">Enter patterns to ignore, one per line (e.g., *.log, temp*)</div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    // Handle checkbox and select changes
                    document.querySelectorAll('input[type="checkbox"], select').forEach(element => {
                        element.addEventListener('change', (e) => {
                            vscode.postMessage({
                                type: 'updateSetting',
                                setting: e.target.id,
                                value: e.target.type === 'checkbox' ? e.target.checked : e.target.value
                            });
                        });
                    });

                    // Handle ignore patterns changes
                    document.getElementById('ignorePatterns').addEventListener('change', (e) => {
                        vscode.postMessage({
                            type: 'updateSetting',
                            setting: 'ignorePatterns',
                            value: e.target.value.split('\\n').filter(pattern => pattern.trim())
                        });
                    });
                </script>
            </body>
            </html>`;
    }

    private _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'updateSetting':
                        await vscode.workspace.getConfiguration('files-to-llm-prompt').update(
                            message.setting,
                            message.value,
                            vscode.ConfigurationTarget.Global
                        );
                        // Notify that settings have changed
                        vscode.commands.executeCommand('files-to-llm-prompt.refreshFileExplorer');
                        break;
                }
            },
            undefined,
            []
        );
    }
}