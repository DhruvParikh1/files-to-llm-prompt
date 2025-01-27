# Files to LLM Prompt

Convert your workspace files into well-structured prompts for Large Language Models (LLMs), with special optimization for Claude's XML format.

## Features

- **File Management**:
  - Interactive file explorer with fuzzy search
  - Smart filtering with .gitignore support
  - Custom ignore patterns with glob support
  - Visual tracking of excluded content

- **Preview & Output**:
  - Split-view interface with real-time preview
  - Token counting using o200k_base encoder (±15% accuracy)
  - Claude-optimized XML format
  - One-click copy to clipboard

## Requirements

- VS Code 1.96.0 or higher

## Settings

* `files-to-llm-prompt.includeHidden`: Show files starting with dot (.)
* `files-to-llm-prompt.overrideGitignore`: Show all files, including those in .gitignore
* `files-to-llm-prompt.includeDirectories`: Apply ignore patterns to folders
* `files-to-llm-prompt.ignorePatterns`: Patterns for files and folders to hide from the explorer (e.g., *.log, node_modules)
* `files-to-llm-prompt.outputFormat`: 'default' or 'claude-xml'
* `files-to-llm-prompt.fuzzySearchThreshold`: Search sensitivity (0-1, default: 0.6)

## Usage

1. Open the Files to LLM Prompt sidebar (click the icon in the activity bar)
2. Use the file explorer to select files:
   - Click files/folders to toggle selection
   - Use the search bar to quickly find files
   - Use bulk selection buttons in the title bar
3. Configure settings in the Settings panel below the file explorer
4. Click "Generate Prompt" (available in multiple locations):
   - Status bar
   - Title bar
   - Preview panel
5. Preview the generated prompt and copy to clipboard when ready

## Output Formats

### Claude XML
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

### Default Format
```
path/to/file.js
---
// File contents here
---
```

## Performance Considerations

- Fuzzy search is optimized with debouncing
- Efficient file filtering system
- Handles workspace changes well

## Known Issues

- Very large files/code-bases may impact performance

## Contributing

Found a bug or have a feature request? Please open an issue or submit a pull request on our [GitHub repository](https://github.com/DhruvParikh1/files-to-llm-prompt).

---
