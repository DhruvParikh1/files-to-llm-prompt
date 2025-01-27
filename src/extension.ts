import * as vscode from 'vscode';
import { FileExplorerProvider } from './providers/FileExplorerProvider';
import { SettingsProvider } from './providers/SettingsProvider';
import { PreviewPanel } from './panels/PreviewPanel';
import { generatePrompt, generateTreeStructure } from './utils/fileUtils';

export function activate(context: vscode.ExtensionContext) {
    const debugLogger = vscode.window.createOutputChannel("Files-to-LLM Extension");
    debugLogger.appendLine('Files to LLM Prompt extension is now active');

    // Register File Explorer Provider
    const fileExplorerProvider = new FileExplorerProvider(context);

    fileExplorerProvider.onDidUpdateExclusions(() => {
        if (PreviewPanel.currentPanel) {
            PreviewPanel.currentPanel.updateExcludedContent(
                fileExplorerProvider.getExcludedEntries()
            );
        }
    });
    
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

    context.subscriptions.push(
        vscode.commands.registerCommand('files-to-llm-prompt.searchFiles', 
            (searchTerm: string) => fileExplorerProvider.searchWorkspaceFiles(searchTerm)
        )
    );

    // Register tree view
    const treeView = vscode.window.createTreeView('files-to-llm-prompt-explorer', {
        treeDataProvider: fileExplorerProvider
    });

    if (PreviewPanel.currentPanel) {
        PreviewPanel.currentPanel.updateAvailableFiles(fileExplorerProvider.getAllFiles());
    }

    // ADDED: Listen for tree view visibility changes
    context.subscriptions.push(
        treeView.onDidChangeVisibility(e => {
            if (e.visible) {
                debugLogger.appendLine('Tree view became visible - showing preview panel');
                PreviewPanel.createOrShow(context.extensionUri);
            }
        })
    );

    // ADDED: If the tree view is already visible when the extension loads, show the preview panel
    if (treeView.visible) {
        debugLogger.appendLine('Tree view is initially visible - showing preview panel');
        PreviewPanel.createOrShow(context.extensionUri);
    }

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
    
                // Generate tree structure if enabled
                let finalPrompt = '';
                if (config.get('includeTreeStructure')) {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (!workspaceFolders) {
                        vscode.window.showErrorMessage('No workspace folder found');
                        return;
                    }

                    const treeStructure = await generateTreeStructure(
                        workspaceFolders[0].uri.fsPath,
                        {
                            includeHidden: config.get('includeHidden') || false,
                            includeDirectories: config.get('includeDirectories') || false,
                            ignoreGitignore: config.get('ignoreGitignore') || false,
                            ignorePatterns: config.get('ignorePatterns') || [],
                            outputFormat: config.get('outputFormat') || 'claude-xml'
                        }
                    );

                    if (config.get('outputFormat') === 'claude-xml') {
                        // Start with documents tag and tree structure, with consistent indentation
                        finalPrompt = `<documents>
<document index="1">
<source>project-structure</source>
<document_content>
${treeStructure}</document_content>
</document>`;
                    
                        // Add the rest of the prompt, but increment all indices by 1
                        const restOfPrompt = prompt
                            .replace('<documents>\n', '') // Remove opening documents tag
                            .replace('</documents>', '') // Remove closing documents tag
                            .replace(/<document index="(\d+)">/g, (match, index) => 
                                `<document index="${parseInt(index) + 1}">`
                            )
                            .trim(); // Remove any trailing whitespace
                    
                        finalPrompt += `\n${restOfPrompt}\n</documents>`; // Single newline before closing tag
                    } else {
                        // For default format, put tree structure first
                        finalPrompt = `project-structure\n---\n${treeStructure}\n---\n\n${prompt}`;
                    }
                } else {
                    finalPrompt = prompt;
                }
    
                // Ensure preview panel is visible and update it
                PreviewPanel.createOrShow(context.extensionUri);
                await new Promise(resolve => setTimeout(resolve, 500));
                if (PreviewPanel.currentPanel) {
                    PreviewPanel.currentPanel.updateFileList(selectedFiles);
                    PreviewPanel.currentPanel.updateContent(finalPrompt);
                    debugLogger.appendLine('Updated preview panel with content and file list');
                } else {
                    debugLogger.appendLine('Failed to initialize preview panel');
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