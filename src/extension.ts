import * as vscode from 'vscode';
import { FileExplorerProvider } from './providers/FileExplorerProvider';
import { SettingsProvider } from './providers/SettingsProvider';
import { PreviewPanel } from './panels/PreviewPanel';
import { generatePrompt } from './utils/fileUtils';

export function activate(context: vscode.ExtensionContext) {
    const debugLogger = vscode.window.createOutputChannel("Files-to-LLM Extension");
    debugLogger.appendLine('Files to LLM Prompt extension is now active');

    // Register File Explorer Provider
    const fileExplorerProvider = new FileExplorerProvider(context);
    
    // Register refresh command first
    let refreshCommand = vscode.commands.registerCommand(
        'files-to-llm-prompt.refreshFileExplorer',
        () => {
            debugLogger.appendLine('Refresh command triggered');
            fileExplorerProvider.refresh();
            debugLogger.appendLine('Refresh completed');
        }
    );
    context.subscriptions.push(refreshCommand);

    // Register tree view
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider(
            'files-to-llm-prompt-explorer',
            fileExplorerProvider
        )
    );

    // Register Settings Provider
    const settingsProvider = new SettingsProvider();
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'files-to-llm-prompt-settings',
            settingsProvider
        )
    );

    // Add status bar item
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = "$(arrow-right) Generate Prompt";
    statusBarItem.command = 'files-to-llm-prompt.generatePrompt';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Log when configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('files-to-llm-prompt')) {
                debugLogger.appendLine('\n=== Configuration Changed ===');
                const config = vscode.workspace.getConfiguration('files-to-llm-prompt');
                debugLogger.appendLine(`New configuration: ${JSON.stringify(config, null, 2)}`);
                fileExplorerProvider.refresh();
                debugLogger.appendLine('Tree view refreshed due to configuration change');
            }
        })
    );

    // Register Generate Prompt Command
    let generatePromptCommand = vscode.commands.registerCommand(
        'files-to-llm-prompt.generatePrompt',
        async () => {
            debugLogger.appendLine('\n=== Generate Prompt Command Triggered ===');
            const selectedFiles = fileExplorerProvider.getSelectedFiles();
            debugLogger.appendLine(`Selected files: ${JSON.stringify(selectedFiles)}`);

            if (selectedFiles.length === 0) {
                vscode.window.showWarningMessage('Please select at least one file to generate a prompt.');
                return;
            }

            // Show quick pick for output options
            const outputOption = await vscode.window.showQuickPick(
                [
                    { label: 'Show in Preview', description: 'Open the prompt in a preview window' },
                    { label: 'Copy to Clipboard', description: 'Copy the prompt to clipboard' }
                ],
                { placeHolder: 'How would you like to output the prompt?' }
            );

            if (!outputOption) {
                return;
            }

            try {
                const config = vscode.workspace.getConfiguration('files-to-llm-prompt');
                debugLogger.appendLine(`Using configuration: ${JSON.stringify(config, null, 2)}`);

                const prompt = await generatePrompt(selectedFiles, {
                    includeHidden: config.get('includeHidden') || false,
                    includeDirectories: config.get('includeDirectories') || false,
                    ignoreGitignore: config.get('ignoreGitignore') || false,
                    ignorePatterns: config.get('ignorePatterns') || [],
                    outputFormat: config.get('outputFormat') || 'claude-xml'
                });

                if (outputOption.label === 'Show in Preview') {
                    PreviewPanel.createOrShow(context.extensionUri);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    if (PreviewPanel.currentPanel) {
                        PreviewPanel.currentPanel.updateFileList(selectedFiles);
                        PreviewPanel.currentPanel.updateContent(prompt);
                        console.log('Updated preview panel with content and file list');
                    } else {
                        console.log('Failed to initialize preview panel');
                    }
                    debugLogger.appendLine('Displayed prompt in preview panel');
                } else {
                    await vscode.env.clipboard.writeText(prompt);
                    vscode.window.showInformationMessage('Prompt copied to clipboard!');
                    debugLogger.appendLine('Copied prompt to clipboard');
                }
            } catch (error) {
                debugLogger.appendLine(`Error generating prompt: ${error}`);
                vscode.window.showErrorMessage(`Error generating prompt: ${error}`);
            }
        }
    );

    // Register other commands
    let generatePromptButtonCommand = vscode.commands.registerCommand(
        'files-to-llm-prompt.generatePromptButton',
        () => {
            debugLogger.appendLine('Generate prompt button clicked');
            vscode.commands.executeCommand('files-to-llm-prompt.generatePrompt');
        }
    );

    context.subscriptions.push(generatePromptCommand, generatePromptButtonCommand);
}

export function deactivate() {}