"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderProjectOptions = renderProjectOptions;
exports.renderIterationOptions = renderIterationOptions;
exports.renderAreaOptions = renderAreaOptions;
exports.renderStateOptions = renderStateOptions;
exports.renderWorkItemTypeOptions = renderWorkItemTypeOptions;
const html_1 = require("./html");
function option(value, label, selected) {
    const isSelected = value === selected ? ' selected' : '';
    return `<option value="${(0, html_1.escapeHtml)(value)}"${isSelected}>${(0, html_1.escapeHtml)(label)}</option>`;
}
function renderProjectOptions(projects, selected = '') {
    return projects.map((project) => option(project.name, project.name, selected)).join('');
}
function renderIterationOptions(iterations, selected = '') {
    return iterations
        .map((iteration) => option(iteration.path, iteration.name, selected))
        .join('');
}
function renderAreaOptions(areas, selected = '') {
    return areas
        .map((area) => option(area.path, area.label, selected))
        .join('');
}
function renderStateOptions(states, selected = '') {
    return states
        .map((state) => option(state.name, `${state.name} (${state.category})`, selected))
        .join('');
}
function renderWorkItemTypeOptions(types, selected = '') {
    return types.map((type) => option(type, type, selected)).join('');
}
//# sourceMappingURL=searchFilterHtml.js.map