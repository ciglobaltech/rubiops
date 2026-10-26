"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.basePanelStyles = basePanelStyles;
function basePanelStyles() {
    return `
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      line-height: 1.4;
    }
    .page {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px 32px;
    }
    .center {
      text-align: center;
      padding: 48px 24px;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 600;
    }
    button, .btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    button:hover, .btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .task-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .task-item {
      padding: 12px 14px;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 6px;
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
    }
    .task-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .task-item.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
      border-color: var(--vscode-focusBorder);
    }
    .task-title { font-size: 13px; font-weight: 500; }
    .task-meta {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }
    .task-item.selected .task-meta {
      color: inherit;
      opacity: 0.85;
    }
    .empty {
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
      padding: 12px 4px;
    }
    input, select {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 8px 10px;
      font-size: 13px;
      width: 100%;
      box-sizing: border-box;
    }
    label {
      display: block;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }
    .field { margin-bottom: 12px; }
  `;
}
//# sourceMappingURL=panelStyles.js.map