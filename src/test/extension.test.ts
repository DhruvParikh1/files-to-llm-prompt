import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { generatePrompt, processFiles } from '../utils/fileUtils';

suite('Extension Test Suite', function () {
	this.timeout(20000);

	const extensionId = 'DhrxvExtensions.files-to-llm-prompt';
	let tempWorkspacePath: string | undefined;

	suiteSetup(async () => {
		const extension = vscode.extensions.getExtension(extensionId);
		assert.ok(extension, `Expected extension ${extensionId} to be installed in test host`);
		await extension!.activate();

		if (!vscode.workspace.workspaceFolders?.length) {
			tempWorkspacePath = path.join(os.tmpdir(), `files-to-llm-workspace-${Date.now()}`);
			await fs.mkdir(tempWorkspacePath, { recursive: true });
			vscode.workspace.updateWorkspaceFolders(0, 0, {
				uri: vscode.Uri.file(tempWorkspacePath),
				name: 'files-to-llm-test-workspace'
			});

			for (let i = 0; i < 20; i++) {
				if (vscode.workspace.workspaceFolders?.length) {
					break;
				}
				await new Promise(resolve => setTimeout(resolve, 100));
			}
		}
	});

	suiteTeardown(async () => {
		if (tempWorkspacePath) {
			const workspaceIndex = (vscode.workspace.workspaceFolders || []).findIndex(
				folder => folder.uri.fsPath === tempWorkspacePath
			);
			if (workspaceIndex >= 0) {
				vscode.workspace.updateWorkspaceFolders(workspaceIndex, 1);
			}
			await fs.rm(tempWorkspacePath, { recursive: true, force: true });
		}
	});

	test('registers contributed commands', async () => {
		const registeredCommands = await vscode.commands.getCommands(true);
		const expectedCommands = [
			'files-to-llm-prompt.generatePrompt',
			'files-to-llm-prompt.selectAll',
			'files-to-llm-prompt.deselectAll',
			'files-to-llm-prompt.openPreview',
			'files-to-llm-prompt.refreshFileExplorer'
		];

		for (const command of expectedCommands) {
			assert.ok(
				registeredCommands.includes(command),
				`Expected command to be registered: ${command}`
			);
		}
	});

	test('respects overrideGitignore and applies generation transforms', async () => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(workspaceFolder, 'Expected a workspace folder for extension tests');
		const workspacePath = workspaceFolder!.uri.fsPath;

		const testDir = path.join(workspacePath, `.tmp-files-to-llm-${Date.now()}`);
		const keepFile = path.join(testDir, 'keep.txt');
		const ignoredFile = path.join(testDir, 'ignored.txt');

		await fs.mkdir(testDir, { recursive: true });
		await fs.writeFile(path.join(testDir, '.gitignore'), 'ignored.txt\n', 'utf8');
		await fs.writeFile(keepFile, 'alpha TOKEN beta', 'utf8');
		await fs.writeFile(ignoredFile, 'should-be-ignored', 'utf8');

		try {
			const filtered = await processFiles([keepFile, ignoredFile], {
				includeHidden: true,
				includeDirectories: false,
				overrideGitignore: false,
				ignorePatterns: [],
				outputFormat: 'default',
				pathStyle: 'relative'
			});
			assert.strictEqual(filtered.length, 1);
			assert.strictEqual(filtered[0].path, keepFile);

			const unfiltered = await processFiles([keepFile, ignoredFile], {
				includeHidden: true,
				includeDirectories: false,
				overrideGitignore: true,
				ignorePatterns: [],
				outputFormat: 'default',
				pathStyle: 'relative'
			});
			assert.strictEqual(unfiltered.length, 2);

			const output = await generatePrompt([keepFile], {
				includeHidden: true,
				includeDirectories: false,
				overrideGitignore: true,
				ignorePatterns: [],
				outputFormat: 'default',
				pathStyle: 'relative',
				stripPatternsEnabled: true,
				stripPatterns: ['TOKEN\\s*']
			});

			const expectedRelativePath = path.relative(workspacePath, keepFile).replace(/\\/g, '/');
			assert.ok(output.includes(expectedRelativePath), 'Expected relative path in output');
			assert.ok(!output.includes('TOKEN'), 'Expected strip pattern to remove TOKEN');
		} finally {
			await fs.rm(testDir, { recursive: true, force: true });
		}
	});

});
