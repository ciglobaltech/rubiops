import {
  IterationOption,
  OrgStateOption,
  ProjectOption,
  AreaOption,
} from '../models/query';
import { escapeHtml } from './html';

function option(value: string, label: string, selected: string): string {
  const isSelected = value === selected ? ' selected' : '';
  return `<option value="${escapeHtml(value)}"${isSelected}>${escapeHtml(label)}</option>`;
}

export function renderProjectOptions(projects: ProjectOption[], selected = ''): string {
  return projects.map((project) => option(project.name, project.name, selected)).join('');
}

export function renderIterationOptions(iterations: IterationOption[], selected = ''): string {
  return iterations
    .map((iteration) => option(iteration.path, iteration.name, selected))
    .join('');
}

export function renderAreaOptions(areas: AreaOption[], selected = ''): string {
  return areas
    .map((area) => option(area.path, area.label, selected))
    .join('');
}

export function renderStateOptions(states: OrgStateOption[], selected = ''): string {
  return states
    .map((state) => option(state.name, `${state.name} (${state.category})`, selected))
    .join('');
}

export function renderWorkItemTypeOptions(types: string[], selected = ''): string {
  return types.map((type) => option(type, type, selected)).join('');
}
