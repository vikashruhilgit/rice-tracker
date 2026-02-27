import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import yaml from 'js-yaml';
import type { IssueType, Priority, DependencyType } from '../types/index.js';
import { createIssue } from './issue-service.js';
import { addDependency } from './dependency-service.js';

// ── Template schema types ───────────────────────────────────────────

export interface TemplateVariable {
  name: string;
  required?: boolean;
  default?: string;
}

export interface TemplateIssueDependency {
  id: string;          // local reference ID from the template
  type: DependencyType;
}

export interface TemplateIssue {
  id: string;          // local reference ID (used in depends_on only)
  title: string;
  type?: IssueType;
  priority?: string;   // may contain variable placeholders
  labels?: string[];
  description?: string;
  depends_on?: TemplateIssueDependency[];
}

export interface Template {
  name: string;
  description?: string;
  variables?: TemplateVariable[];
  issues: TemplateIssue[];
}

export interface TemplateListItem {
  name: string;
  path: string;
  issueCount: number;
}

export interface AppliedIssue {
  localId: string;
  rtId: string;
  title: string;
}

export interface AppliedDependency {
  from: string;   // rt issue ID
  to: string;     // rt issue ID
  type: DependencyType;
}

export interface ApplyResult {
  created: AppliedIssue[];
  dependencies: AppliedDependency[];
}

// ── Template directory resolution ───────────────────────────────────

function getTemplatesDir(): string {
  return join(process.cwd(), '.rt', 'templates');
}

// ── Load and parse template ──────────────────────────────────────────

export function loadTemplate(nameOrPath: string): { path: string; template: Template } {
  const templatesDir = getTemplatesDir();

  // If it's a path, use directly
  let filePath = nameOrPath;
  if (!nameOrPath.includes('/') && !nameOrPath.includes('\\')) {
    // Try YAML first, then JSON
    const yamlPath = join(templatesDir, `${nameOrPath}.yaml`);
    const ymlPath = join(templatesDir, `${nameOrPath}.yml`);
    const jsonPath = join(templatesDir, `${nameOrPath}.json`);

    for (const candidate of [yamlPath, ymlPath, jsonPath]) {
      try {
        statSync(candidate);
        filePath = candidate;
        break;
      } catch {
        // not found, try next
      }
    }
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`Template file not found: ${filePath}`);
  }

  let parsed: unknown;
  const ext = extname(filePath).toLowerCase();
  try {
    if (ext === '.json') {
      parsed = JSON.parse(raw);
    } else {
      parsed = yaml.load(raw);
    }
  } catch (err) {
    throw new Error(`Failed to parse template "${nameOrPath}": ${err instanceof Error ? err.message : err}`);
  }

  const errors = validateTemplate(parsed);
  if (errors.length > 0) {
    throw new Error(`Template "${nameOrPath}" is invalid:\n  - ${errors.join('\n  - ')}`);
  }

  return { path: filePath, template: parsed as Template };
}

// ── Template validation ──────────────────────────────────────────────

const VALID_TYPES: IssueType[] = ['task', 'bug', 'epic', 'message', 'decision'];
const VALID_DEP_TYPES: DependencyType[] = ['blocks', 'related', 'parent_child', 'duplicates', 'supersedes', 'replies_to'];

export function validateTemplate(data: unknown): string[] {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return ['Template must be a YAML/JSON object'];
  }

  const t = data as Record<string, unknown>;

  if (!t.name || typeof t.name !== 'string') errors.push('Template "name" is required and must be a string');
  if (!Array.isArray(t.issues) || t.issues.length === 0) errors.push('Template "issues" must be a non-empty array');

  if (Array.isArray(t.variables)) {
    for (const v of t.variables as Record<string, unknown>[]) {
      if (!v.name) errors.push(`Variable missing "name" field`);
    }
  }

  if (Array.isArray(t.issues)) {
    const localIds = new Set<string>();
    for (const issue of t.issues as Record<string, unknown>[]) {
      if (!issue.id) errors.push(`Issue missing "id" field`);
      if (!issue.title) errors.push(`Issue "${issue.id ?? '?'}" missing "title" field`);
      if (issue.type && !VALID_TYPES.includes(issue.type as IssueType)) {
        errors.push(`Issue "${issue.id}" has invalid type "${issue.type}". Valid: ${VALID_TYPES.join(', ')}`);
      }
      if (issue.id) localIds.add(issue.id as string);
    }

    // Check depends_on references exist
    for (const issue of t.issues as Record<string, unknown>[]) {
      if (Array.isArray(issue.depends_on)) {
        for (const dep of issue.depends_on as Record<string, unknown>[]) {
          if (!dep.id) errors.push(`Dependency in "${issue.id}" missing "id" field`);
          if (dep.id && !localIds.has(dep.id as string)) {
            errors.push(`Issue "${issue.id}" depends_on unknown local ID "${dep.id}"`);
          }
          if (dep.type && !VALID_DEP_TYPES.includes(dep.type as DependencyType)) {
            errors.push(`Dependency type "${dep.type}" in "${issue.id}" is invalid. Valid: ${VALID_DEP_TYPES.join(', ')}`);
          }
        }
      }
    }
  }

  return errors;
}

// ── Variable substitution ────────────────────────────────────────────

export function substituteVariables(template: Template, vars: Record<string, string>): Template {
  // Build effective vars: provided vars override defaults
  const effective: Record<string, string> = {};
  for (const v of template.variables ?? []) {
    if (vars[v.name] !== undefined) {
      effective[v.name] = vars[v.name];
    } else if (v.default !== undefined) {
      effective[v.name] = v.default;
    } else if (v.required) {
      throw new Error(`Required variable "${v.name}" not provided. Use --var ${v.name}=<value>`);
    }
  }

  function substitute(str: string | undefined): string | undefined {
    if (str === undefined) return undefined;
    return str.replace(/\{\{(\w+)\}\}/g, (_, name) => effective[name] ?? `{{${name}}}`);
  }

  return {
    ...template,
    issues: template.issues.map((issue) => ({
      ...issue,
      title: substitute(issue.title)!,
      description: substitute(issue.description),
      priority: substitute(issue.priority),
    })),
  };
}

// ── Apply template ───────────────────────────────────────────────────

function parsePriority(val: string | undefined): Priority {
  if (!val) return 2;
  const normalized = val.trim().toUpperCase();
  const map: Record<string, Priority> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return map[normalized] ?? 2;
}

export async function applyTemplate(template: Template): Promise<ApplyResult> {
  // Map local template IDs to created rt issue IDs
  const localIdToRtId = new Map<string, string>();
  const created: AppliedIssue[] = [];
  const dependencies: AppliedDependency[] = [];

  for (const templateIssue of template.issues) {
    const issue = await createIssue({
      title: templateIssue.title,
      description: templateIssue.description,
      type: templateIssue.type ?? 'task',
      priority: parsePriority(templateIssue.priority),
      labels: templateIssue.labels,
    });

    localIdToRtId.set(templateIssue.id, issue.id);
    created.push({ localId: templateIssue.id, rtId: issue.id, title: issue.title });
  }

  // Create dependencies after all issues are created
  for (const templateIssue of template.issues) {
    if (!templateIssue.depends_on) continue;
    const fromRtId = localIdToRtId.get(templateIssue.id)!;

    for (const dep of templateIssue.depends_on) {
      const toRtId = localIdToRtId.get(dep.id);
      if (!toRtId) continue;

      // dep.type 'blocks' means templateIssue blocks dep.id
      await addDependency(fromRtId, toRtId, dep.type);
      dependencies.push({ from: fromRtId, to: toRtId, type: dep.type });
    }
  }

  return { created, dependencies };
}

// ── List templates ───────────────────────────────────────────────────

export function listTemplates(): TemplateListItem[] {
  const templatesDir = getTemplatesDir();

  let files: string[];
  try {
    files = readdirSync(templatesDir);
  } catch {
    return []; // .rt/templates/ doesn't exist yet
  }

  const items: TemplateListItem[] = [];
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!['.yaml', '.yml', '.json'].includes(ext)) continue;

    const filePath = join(templatesDir, file);
    try {
      const { template } = loadTemplate(filePath);
      items.push({
        name: template.name ?? basename(file, ext),
        path: filePath,
        issueCount: template.issues.length,
      });
    } catch {
      // Skip invalid template files
    }
  }

  return items;
}
