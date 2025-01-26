# Files to LLM Prompt

Convert your workspace files into well-structured prompts for Large Language Models (LLMs), with special optimization for Claude's XML format.

## Features

- **Advanced File Selection**:
  - Interactive file explorer with checkbox selection
  - Fuzzy search functionality for quick file finding
  - Bulk selection/deselection options
  - Directory-based selection

- **Smart Filtering**:
  - Honor .gitignore rules
  - Filter hidden files
  - Custom ignore patterns with glob support
  - Directory-based filtering
  - Visual tracking of excluded content

- **Enhanced Preview System**:
  - Split-view interface with file list and preview
  - Real-time sync status indicators
  - One-click copy to clipboard
  - Excluded files visibility
  - File count tracking

- **Output Formats**:
  - Claude-optimized XML format
  - Simple text format with clear file separators

- **Comprehensive Settings**:
  - Visual settings panel
  - Real-time configuration updates
  - Customizable search behavior
  - Flexible ignore patterns

## Requirements

- VS Code 1.96.0 or higher
- No additional dependencies required

## Extension Settings

This extension contributes the following settings:

* `files-to-llm-prompt.includeHidden`: Show files and folders that start with a dot (.)
* `files-to-llm-prompt.overrideGitignore`: Show all files, including those listed in .gitignore files
* `files-to-llm-prompt.includeDirectories`: Apply ignore patterns to folder names as well as file names
* `files-to-llm-prompt.ignorePatterns`: Patterns for files and folders to hide from the explorer (e.g., *.log, node_modules)
* `files-to-llm-prompt.outputFormat`: Choose between 'default' and 'claude-xml' output formats
* `files-to-llm-prompt.fuzzySearchThreshold`: Adjust the sensitivity of fuzzy search (0-1, default: 0.6)

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

### Search Functionality

- Use the search bar in the preview panel to quickly find files
- Fuzzy matching helps find files even with partial or imperfect matches
- Real-time search results with highlighted matches
- Quick add buttons for search results

### Preview Panel Features

- Split view showing both selected files and preview
- Sync status indicator when changes are pending
- List of excluded files/folders with pattern information
- File count display
- One-click copy to clipboard
- Refresh button to update preview

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

## Performance Considerations

- Fuzzy search is optimized with debouncing
- Real-time preview updates
- Efficient file filtering system
- Handles workspace changes gracefully

## Known Issues

- Very large files may impact performance
- Binary files are automatically excluded
- Maximum file size limit is determined by VS Code's file reading capabilities

## Release Notes

### 0.0.5 - Current Release

- Added fuzzy search functionality
- Enhanced preview panel with sync status
- Added excluded files visibility
- Improved file selection UI
- Added file count display
- Real-time search results
- Performance optimizations

### 0.0.1 - Initial Release

- Basic file explorer with checkbox selection
- Multiple output formats
- Simple preview functionality
- Basic filtering options
- Settings panel

## Contributing

Found a bug or have a feature request? Please open an issue or submit a pull request on our [GitHub repository](https://github.com/DhruvParikh1/files-to-llm-prompt).

---
