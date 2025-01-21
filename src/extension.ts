import * as vscode from 'vscode';
import { FileExplorerProvider } from './providers/FileExplorerProvider';
import { SettingsProvider } from './providers/SettingsProvider';
import { PreviewPanel } from './panels/PreviewPanel';
import { generatePrompt } from './utils/fileUtils';

export function activate(context: vscode.ExtensionContext) {
    console.log('Files to LLM Prompt extension is now active');

    // Register File Explorer Provider
    const fileExplorerProvider = new FileExplorerProvider(context);
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

    // Register Generate Prompt Command
    let generatePromptCommand = vscode.commands.registerCommand(
        'files-to-llm-prompt.generatePrompt',
        async () => {
            const selectedFiles = fileExplorerProvider.getSelectedFiles();
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
                const prompt = await generatePrompt(selectedFiles, {
                    includeHidden: config.get('includeHidden') || false,
                    includeDirectories: config.get('includeDirectories') || false,
                    ignoreGitignore: config.get('ignoreGitignore') || false,
                    ignorePatterns: config.get('ignorePatterns') || [],
                    outputFormat: config.get('outputFormat') || 'claude-xml'
                });

                if (outputOption.label === 'Show in Preview') {
                    PreviewPanel.createOrShow(context.extensionUri);
                    // Wait a bit for the panel to be ready
                    await new Promise(resolve => setTimeout(resolve, 500));
                    PreviewPanel.currentPanel?.updateContent(prompt);
                } else {
                    await vscode.env.clipboard.writeText(prompt);
                    vscode.window.showInformationMessage('Prompt copied to clipboard!');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Error generating prompt: ${error}`);
            }
        }
    );

    // Register Generate Prompt Button Command
    let generatePromptButtonCommand = vscode.commands.registerCommand(
        'files-to-llm-prompt.generatePromptButton',
        () => {
            vscode.commands.executeCommand('files-to-llm-prompt.generatePrompt');
        }
    );

    // Register Refresh Command
    let refreshCommand = vscode.commands.registerCommand(
        'files-to-llm-prompt.refreshFileExplorer',
        () => {
            fileExplorerProvider.refresh();
        }
    );

    context.subscriptions.push(generatePromptCommand, generatePromptButtonCommand, refreshCommand);
}

export function deactivate() {}