// SettingsProvider.ts
import * as vscode from 'vscode';

export class SettingsProvider implements vscode.WebviewViewProvider {
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
        
        // Refresh view when it becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
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
                        line-height: 1.5;
                    }
                    .section-title {
                        font-size: 1.1em;
                        font-weight: 600;
                        margin: 16px 0 8px 0;
                    }
                    .setting-group {
                        background: var(--vscode-editor-background);
                        border-radius: 6px;
                        padding: 12px;
                        margin: 8px 0;
                    }
                    .setting-item { 
                        margin-bottom: 20px;
                        padding: 8px;
                        border-radius: 4px;
                    }
                    .setting-item:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    .checkbox-item {
                        display: flex;
                        flex-direction: column;
                        margin-bottom: 12px;
                        padding: 8px;
                        border-radius: 4px;
                    }
                    .checkbox-row {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-bottom: 4px;
                    }
                    .checkbox-row input[type="checkbox"] {
                        margin: 0;
                    }
                    .checkbox-row label {
                        font-weight: 500;
                    }
                    .description {
                        font-size: 0.9em;
                        opacity: 0.8;
                        margin-left: 24px;
                    }
                    .examples-list {
                        margin: 8px 0 8px 24px;
                        padding-left: 16px;
                    }
                    .examples-list li {
                        margin: 4px 0;
                    }
                    select, textarea {
                        width: 100%;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        padding: 8px;
                        margin-top: 8px;
                        border-radius: 4px;
                        font-family: var(--vscode-editor-font-family);
                    }
                    select:focus, textarea:focus {
                        outline: 1px solid var(--vscode-focusBorder);
                        border-color: var(--vscode-focusBorder);
                    }
                    .info-icon {
                        display: inline-block;
                        width: 16px;
                        height: 16px;
                        margin-left: 4px;
                        opacity: 0.7;
                    }
                </style>
            </head>
            <body>
                <div class="section-title">File & Folder Visibility</div>
                <div class="setting-group">
                    <div class="checkbox-item">
                        <div class="checkbox-row">
                            <input type="checkbox" id="includeHidden" 
                                ${config.get('includeHidden') ? 'checked' : ''}>
                            <label>Show Hidden Items</label>
                        </div>
                        <div class="description">
                            Display files and folders that start with a dot (.), such as .git or .env files
                        </div>
                    </div>

                    <div class="checkbox-item">
                        <div class="checkbox-row">
                            <input type="checkbox" id="overrideGitignore" 
                                ${config.get('overrideGitignore') ? 'checked' : ''}>
                            <label>Override .gitignore Rules</label>
                        </div>
                        <div class="description">
                            Show all files in the explorer, including those that would normally be hidden by .gitignore rules
                        </div>
                    </div>
                </div>

                <div class="section-title">File Filtering</div>
                <div class="setting-group">
                    <div class="checkbox-item">
                        <div class="checkbox-row">
                            <input type="checkbox" id="includeDirectories" 
                                ${config.get('includeDirectories') ? 'checked' : ''}>
                            <label>Apply Filters to Folders</label>
                        </div>
                        <div class="description">
                            When enabled, ignore patterns will also hide matching folder names from the explorer
                        </div>
                    </div>

                    <div class="setting-item">
                        <label>Ignore Patterns</label>
                        <div class="description">
                            Specify patterns to hide files and folders from the explorer. Files matching these patterns cannot be selected.
                            <ul class="examples-list">
                                <li><code>*.log</code> - Hides all log files</li>
                                <li><code>node_modules</code> - Hides node_modules folders</li>
                                <li><code>build/*</code> - Hides contents of build folders</li>
                                <li><code>temp*</code> - Hides anything starting with temp</li>
                            </ul>
                        </div>
                        <textarea id="ignorePatterns" rows="4" 
                            placeholder="Enter each pattern on a new line">${(config.get<string[]>('ignorePatterns') || []).join('\n')}</textarea>
                    </div>
                </div>

                <div class="section-title">Output Settings</div>
                <div class="setting-group">
                    <div class="setting-item">
                        <label>Output Format</label>
                        <select id="outputFormat">
                            <option value="default" ${config.get('outputFormat') === 'default' ? 'selected' : ''}>
                                Simple Text (filename + content)
                            </option>
                            <option value="claude-xml" ${config.get('outputFormat') === 'claude-xml' ? 'selected' : ''}>
                                Claude XML Format
                            </option>
                        </select>
                        <div class="description">
                            Choose how the selected files will be formatted in the generated prompt
                        </div>
                    </div>
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

                    // Handle ignore patterns changes with debouncing
                    let timeout;
                    document.getElementById('ignorePatterns').addEventListener('input', (e) => {
                        clearTimeout(timeout);
                        timeout = setTimeout(() => {
                            vscode.postMessage({
                                type: 'updateSetting',
                                setting: 'ignorePatterns',
                                value: e.target.value.split('\n').filter(pattern => pattern.trim())
                            });
                        }, 500);
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