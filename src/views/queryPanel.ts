import * as vscode from 'vscode';
import { WorkItemListItem, WorkItemQueryFilter, SearchFilterOptions } from '../models/query';
import { SelectionService } from '../services/selectionService';
import { WorkItemService } from '../services/workItemService';
import { AuthService } from '../auth/authService';
import { COMMANDS } from '../utils/constants';
import { escapeHtml } from '../utils/html';
import {
  renderAreaOptions,
  renderIterationOptions,
  renderProjectOptions,
  renderStateOptions,
  renderWorkItemTypeOptions,
} from '../utils/searchFilterHtml';
import { basePanelStyles } from './panelStyles';
import { renderConnectGuideHtml } from './connectGuideHtml';
import { openPatHelpPage } from '../utils/connectGuide';

export class QueryPanel {
  public static readonly viewType = 'devopsQuickUpdate.query';
  private panel?: vscode.WebviewPanel;
  private lastWiql = '';
  private filterOptions: SearchFilterOptions = {
    projects: [],
    areas: [],
    iterations: [],
    states: [],
    workItemTypes: [],
    defaultProject: '',
  };

  constructor(
    private readonly workItemService: WorkItemService,
    private readonly authService: AuthService,
    private readonly selectionService: SelectionService
  ) {}

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      await this.loadFilters();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      QueryPanel.viewType,
      'Query & Search',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'search') {
        await this.runSearch(message.filter as WorkItemQueryFilter);
      }
      if (message.type === 'loadSearchFilters' && typeof message.project === 'string') {
        await this.loadSearchFiltersForProject(message.project);
      }
      if (message.type === 'select' && typeof message.id === 'number') {
        this.selectionService.select(message.id, String(message.title ?? ''));
      }
      if (message.type === 'open' && typeof message.id === 'number') {
        await vscode.commands.executeCommand(COMMANDS.OPEN_WORK_ITEM, message.id);
      }
      if (message.type === 'connect') {
        await vscode.commands.executeCommand(COMMANDS.CONNECT);
      }
      if (message.type === 'openPatHelp') {
        await openPatHelpPage(this.authService.getOrganizationUrl());
      }
    });

    await this.loadFilters();
  }

  async refresh(): Promise<void> {
    if (this.panel && this.lastWiql) {
      await this.runSearch(this.getDefaultFilter());
    }
  }

  private async loadFilters(): Promise<void> {
    if (!this.panel) {
      return;
    }

    if (!(await this.authService.isAuthenticated())) {
      this.panel.webview.html = renderConnectGuideHtml({
        workspaceLabel: this.authService.getWorkspaceLabel(),
        showConnectButton: true,
        compact: true,
      });
      return;
    }

    try {
      const projectName = this.authService.getProjectName() ?? '';
      this.filterOptions = await this.workItemService.getSearchFilterOptions(projectName);
      this.panel.webview.html = this.getFilterHtml([], this.getDefaultFilter());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load filters';
      this.panel.webview.html = `<body><div class="center">${escapeHtml(message)}</div></body>`;
    }
  }

  private async loadSearchFiltersForProject(project: string): Promise<void> {
    if (!this.panel) {
      return;
    }

    try {
      this.filterOptions = await this.workItemService.getSearchFilterOptions(project);
      this.panel.webview.postMessage({ type: 'searchFilterOptions', options: this.filterOptions });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load org filters';
      this.panel.webview.postMessage({ type: 'searchFilterError', message });
    }
  }

  private async runSearch(filter: WorkItemQueryFilter): Promise<void> {
    if (!this.panel) {
      return;
    }

    try {
      this.panel.webview.html = this.getFilterHtml([], filter, true);
      const { items, wiql } = await this.workItemService.searchWorkItems(filter);
      this.lastWiql = wiql;
      this.panel.webview.html = this.getFilterHtml(items, filter, false, wiql);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      this.panel.webview.html = this.getFilterHtml([], filter, false, '', message);
    }
  }

  private getDefaultFilter(): WorkItemQueryFilter {
    return {
      assignedToMe: true,
      activeOnly: true,
      project: this.filterOptions.defaultProject || undefined,
    };
  }

  private renderFilterToolbar(filter: WorkItemQueryFilter): string {
    const options = this.filterOptions;
    const project = filter.project ?? options.defaultProject;

    return `<section class="search-toolbar">
      <div class="search-toolbar-head">
        <span class="search-label">Search — org filters from Azure DevOps</span>
        <div class="search-toggles">
          <label class="search-check">
            <input type="checkbox" id="assignedToMe" ${filter.assignedToMe ? 'checked' : ''} />
            Assigned to me
          </label>
          <label class="search-check">
            <input type="checkbox" id="activeOnly" ${filter.activeOnly ? 'checked' : ''} />
            Active only
          </label>
        </div>
      </div>
      <div class="search-row">
        <div class="search-field project-field">
          <label for="projectSelect">Project</label>
          <select id="projectSelect" onchange="onProjectChange()">
            <option value="">All projects</option>
            ${renderProjectOptions(options.projects, project ?? '')}
          </select>
        </div>
        <div class="search-field area-field">
          <label for="areaSelect">Area</label>
          <select id="areaSelect">
            <option value="">All areas</option>
            ${renderAreaOptions(options.areas, filter.areaPath ?? '')}
          </select>
        </div>
        <div class="search-field sprint-field">
          <label for="iterationSelect">Sprint</label>
          <select id="iterationSelect">
            <option value="">All sprints</option>
            ${renderIterationOptions(options.iterations, filter.iterationPath ?? '')}
          </select>
        </div>
        <div class="search-field date-field">
          <label for="dueDateFrom">Due From</label>
          <input type="date" id="dueDateFrom" value="${filter.dueDateFrom ?? ''}" />
        </div>
        <div class="search-field date-field">
          <label for="dueDateTo">Due To</label>
          <input type="date" id="dueDateTo" value="${filter.dueDateTo ?? ''}" />
        </div>
        <div class="search-field">
          <label for="state">State</label>
          <select id="state">
            <option value="">All states</option>
            ${renderStateOptions(options.states, filter.state ?? '')}
          </select>
        </div>
        <div class="search-field">
          <label for="workItemType">Type</label>
          <select id="workItemType">
            <option value="">All types</option>
            ${renderWorkItemTypeOptions(options.workItemTypes, filter.workItemType ?? '')}
          </select>
        </div>
        <div class="search-field title-field">
          <label for="titleContains">Title</label>
          <input id="titleContains" value="${escapeHtml(filter.titleContains ?? '')}" placeholder="Search title" />
        </div>
        <div class="search-actions">
          <button class="search-btn primary" onclick="search()">Search</button>
          <button class="search-btn" onclick="clearSearch()">Clear</button>
        </div>
      </div>
      <p class="search-meta">${options.defaultProject ? `Loaded from org: ${escapeHtml(options.defaultProject)}` : 'Select a project to load org lists'}</p>
      <div class="search-status" id="search-status"></div>
    </section>`;
  }

  private getFilterHtml(
    items: WorkItemListItem[],
    filter: WorkItemQueryFilter,
    loading = false,
    wiql = '',
    error = ''
  ): string {
    const resultsHtml = loading
      ? '<div class="empty">Searching...</div>'
      : error
        ? `<div class="empty">${escapeHtml(error)}</div>`
        : items.length === 0
          ? '<div class="empty">No work items match your query.</div>'
          : `<ul class="task-list">${items
              .map(
                (item) => `
              <li class="task-item" onclick="selectItem(${item.id}, '${escapeAttr(item.title)}')" ondblclick="openItem(${item.id})">
                <div class="task-title">#${item.id} ${escapeHtml(item.title)}</div>
                <div class="task-meta">${escapeHtml(item.workItemType)} · ${escapeHtml(item.state)} · ${escapeHtml(item.iterationPath)}</div>
              </li>`
              )
              .join('')}</ul>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    ${basePanelStyles()}
    ${this.queryStyles()}
  </style>
</head>
<body>
  <div class="page">
    <h1>Query & Search</h1>
    <p class="hint">Filter work items using org sprint, state, type, and member lists from Azure DevOps.</p>

    ${this.renderFilterToolbar(filter)}

    <div class="results">
      <h2>Results (${items.length})</h2>
      ${wiql ? `<div class="wiql">${escapeHtml(wiql)}</div>` : ''}
      ${resultsHtml}
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function firstPathSegment(path) {
      if (!path) return '';
      return path.split('\\')[0];
    }
    function getFilter() {
      const project = document.getElementById('projectSelect').value.trim();
      const areaPath = document.getElementById('areaSelect').value.trim();
      const iterationPath = document.getElementById('iterationSelect').value.trim();
      const resolvedProject = project || firstPathSegment(areaPath) || firstPathSegment(iterationPath);
      if ((areaPath || iterationPath) && !resolvedProject) {
        throw new Error('Select a project before filtering by area or sprint.');
      }
      if (resolvedProject && !project) {
        document.getElementById('projectSelect').value = resolvedProject;
      }
      const assignedToMe = document.getElementById('assignedToMe').checked;
      return {
        assignedToMe,
        activeOnly: document.getElementById('activeOnly').checked,
        project: resolvedProject || undefined,
        areaPath: areaPath || undefined,
        iterationPath: iterationPath || undefined,
        dueDateFrom: document.getElementById('dueDateFrom').value,
        dueDateTo: document.getElementById('dueDateTo').value,
        state: document.getElementById('state').value.trim() || undefined,
        workItemType: document.getElementById('workItemType').value.trim() || undefined,
        titleContains: document.getElementById('titleContains').value.trim() || undefined,
      };
    }
    function onProjectChange() {
      const project = document.getElementById('projectSelect').value;
      const status = document.getElementById('search-status');
      document.getElementById('areaSelect').value = '';
      document.getElementById('iterationSelect').value = '';
      if (!project) {
        fillSelect('areaSelect', 'All areas', [], (item) => item.path, (item) => item.label);
        fillSelect('iterationSelect', 'All sprints', [], (item) => item.path, (item) => item.name);
        return;
      }
      status.textContent = 'Loading org filters...';
      status.className = 'search-status loading';
      vscode.postMessage({ type: 'loadSearchFilters', project });
    }
    function fillSelect(selectId, placeholder, items, getValue, getLabel) {
      const select = document.getElementById(selectId);
      select.innerHTML = '';
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = placeholder;
      select.appendChild(empty);
      for (const item of items) {
        const opt = document.createElement('option');
        opt.value = getValue(item);
        opt.textContent = getLabel(item);
        select.appendChild(opt);
      }
    }
    function updateFilterDropdowns(options) {
      fillSelect('areaSelect', 'All areas', options.areas || [], (item) => item.path, (item) => item.label);
      fillSelect('iterationSelect', 'All sprints', options.iterations || [], (item) => item.path, (item) => item.name);
      fillSelect('state', 'All states', options.states || [], (item) => item.name, (item) => item.name + ' (' + item.category + ')');
      fillSelect('workItemType', 'All types', options.workItemTypes || [], (item) => item, (item) => item);
      const meta = document.querySelector('.search-meta');
      if (meta && options.defaultProject) meta.textContent = 'Loaded from org: ' + options.defaultProject;
    }
    function search() {
      try {
        vscode.postMessage({ type: 'search', filter: getFilter() });
      } catch (error) {
        const status = document.getElementById('search-status');
        status.textContent = error.message || 'Invalid search filters';
        status.className = 'search-status error';
      }
    }
    function clearSearch() {
      document.getElementById('projectSelect').value = ${JSON.stringify(this.filterOptions.defaultProject)};
      onProjectChange();
      document.getElementById('areaSelect').value = '';
      document.getElementById('iterationSelect').value = '';
      document.getElementById('dueDateFrom').value = '';
      document.getElementById('dueDateTo').value = '';
      document.getElementById('state').value = '';
      document.getElementById('workItemType').value = '';
      document.getElementById('titleContains').value = '';
      document.getElementById('assignedToMe').checked = true;
      document.getElementById('activeOnly').checked = true;
    }
    function selectItem(id, title) { vscode.postMessage({ type: 'select', id, title }); }
    function openItem(id) { vscode.postMessage({ type: 'open', id }); }
    document.getElementById('titleContains').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') search();
    });
    window.addEventListener('message', (event) => {
      const data = event.data;
      const status = document.getElementById('search-status');
      if (data.type === 'searchFilterOptions') {
        updateFilterDropdowns(data.options);
        status.textContent = 'Org filters updated';
        status.className = 'search-status ok';
      }
      if (data.type === 'searchFilterError') {
        status.textContent = data.message || 'Failed to load org filters';
        status.className = 'search-status error';
      }
    });
  </script>
</body>
</html>`;
  }

  private queryStyles(): string {
    return `
      .hint { color:var(--vscode-descriptionForeground); font-size:13px; margin:8px 0 16px; }
      .results { background:var(--vscode-sideBar-background); border:1px solid var(--vscode-panel-border);
        border-radius:10px; padding:16px; margin-top:16px; min-height:300px; }
      .wiql { font-family:var(--vscode-editor-font-family); font-size:11px;
        color:var(--vscode-descriptionForeground); background:var(--vscode-textBlockQuote-background);
        padding:10px; border-radius:6px; margin-bottom:12px; white-space:pre-wrap; word-break:break-word; }
      .search-toolbar { background:var(--vscode-sideBar-background); border:1px solid var(--vscode-panel-border);
        border-radius:12px; padding:12px 14px; }
      .search-toolbar-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px; }
      .search-label { font-size:13px; font-weight:700; }
      .search-toggles { display:flex; gap:14px; flex-wrap:wrap; }
      .search-check { font-size:11px; color:var(--vscode-descriptionForeground); display:flex; align-items:center; gap:6px; cursor:pointer; }
      .search-row { display:flex; flex-wrap:nowrap; gap:8px; align-items:flex-end; overflow-x:auto; padding-bottom:4px; }
      .search-field { display:flex; flex-direction:column; min-width:0; flex:1 1 100px; }
      .search-field label { font-size:10px; font-weight:600; color:var(--vscode-descriptionForeground);
        margin-bottom:4px; text-transform:uppercase; letter-spacing:0.03em; white-space:nowrap; }
      .search-field input, .search-field select {
        width:100%; background:var(--vscode-input-background); color:var(--vscode-input-foreground);
        border:1px solid var(--vscode-input-border); border-radius:6px; padding:7px 8px; font-size:12px; min-width:0; }
      .search-actions { display:flex; gap:6px; flex:0 0 auto; align-items:flex-end; }
      .search-btn { background:var(--vscode-button-secondaryBackground); color:var(--vscode-button-secondaryForeground);
        border:none; padding:8px 14px; border-radius:6px; cursor:pointer; font-size:12px; white-space:nowrap; }
      .search-btn.primary { background:var(--vscode-button-background); color:var(--vscode-button-foreground); font-weight:600; }
      .search-meta { margin:8px 0 0; font-size:11px; color:var(--vscode-descriptionForeground); }
      .search-status { margin-top:6px; font-size:11px; min-height:16px; }
      .search-status.loading { color:var(--vscode-descriptionForeground); }
      .search-status.ok { color:#4ec9b0; }
      .search-status.error { color:#f48771; }
    `;
  }
}

function escapeAttr(value: string): string {
  return value.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
