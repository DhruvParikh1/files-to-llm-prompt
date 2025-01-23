# Files to LLM Prompt

Convert your workspace files into well-structured prompts for Large Language Models (LLMs), with special optimization for Claude's XML format.

## Features

- **Smart File Selection**: Interactive file explorer with checkbox selection
- **Intelligent Filtering**:
  - Honor .gitignore rules
  - Filter hidden files
  - Custom ignore patterns
  - Directory-based filtering
- **Flexible Output Formats**:
  - Claude-optimized XML format
  - Simple text format with clear file separators
- **Preview & Copy**: Preview generated prompts or copy directly to clipboard
- **Customizable Settings**: Comprehensive settings panel for fine-tuning behavior

## Requirements

No additional requirements - works out of the box with VS Code 1.96.0 or higher.

## Extension Settings

This extension contributes the following settings:

* `files-to-llm-prompt.includeHidden`: Show files and folders that start with a dot (.)
* `files-to-llm-prompt.overrideGitignore`: Show all files, including those listed in .gitignore files
* `files-to-llm-prompt.includeDirectories`: Apply ignore patterns to folder names as well as file names
* `files-to-llm-prompt.ignorePatterns`: Patterns for files and folders to hide from the explorer (e.g., *.log, node_modules)
* `files-to-llm-prompt.outputFormat`: Choose between 'default' and 'claude-xml' output formats

## Usage

1. Click the Files to LLM Prompt icon in the activity bar
2. Use the file explorer to select files you want to include
3. Configure any filters or settings as needed
4. Click the "Generate Prompt" button
5. Choose to preview the result or copy directly to clipboard

### Output Formats

#### Claude XML Format
```xml
<documents>
<document index="1">
<source>path/to/file.js</source>
<document_content>
// File contents here
</document_content>
</document>
</documents>
```

#### Default Format
```
path/to/file.js
---
// File contents here
---
```

## Known Issues

- Very large files may impact performance
- Binary files are automatically excluded
- Maximum file size limit is determined by VS Code's file reading capabilities

## Release Notes

### 0.0.1 - Initial Release

- File explorer with checkbox selection
- Multiple output formats
- Preview functionality
- Configurable filtering options
- Settings management panel

## Contributing

Found a bug or have a feature request? Please open an issue or submit a pull request on our [GitHub repository](https://github.com/DhruvParikh1/files-to-llm-prompt).

---
