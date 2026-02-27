import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import type { Label } from '../../types/index.js';
import { validateLabel, labelConverter } from '../../models/label.js';
import { labelsCollection } from '../../firebase/collections.js';
import { getIssue, updateIssue } from '../../services/issue-service.js';
import { generateId } from '../../utils/id-generator.js';
import { getCurrentProjectId } from '../../utils/config.js';
import { toJson, errorResult } from './helpers.js';

export function registerLabelTools(server: McpServer): void {
  server.registerTool(
    'rt_create_label',
    {
      description: 'Create a new label, returns label JSON',
      inputSchema: {
        name: z.string().describe('Label name'),
        color: z.string().optional().describe('Hex color code (default: #808080)'),
        description: z.string().optional().describe('Label description'),
      },
    },
    async (args) => {
      try {
        const labelData: Partial<Label> = {
          name: args.name,
          color: args.color ?? '#808080',
          description: args.description ?? '',
        };

        const errors = validateLabel(labelData);
        if (errors.length > 0) {
          return errorResult(new Error(`Validation errors: ${errors.join(', ')}`));
        }

        const projectId = getCurrentProjectId();
        const colRef = labelsCollection(projectId);

        const dupQuery = query(colRef, where('name', '==', args.name));
        const dupSnap = await getDocs(dupQuery);
        if (!dupSnap.empty) {
          return errorResult(new Error(`Label "${args.name}" already exists`));
        }

        const label: Label = {
          id: generateId(),
          name: args.name,
          color: labelData.color!,
          description: labelData.description!,
        };

        const docRef = doc(colRef, label.id);
        await setDoc(docRef, labelConverter.toFirestore(label));

        return { content: [{ type: 'text', text: toJson(label) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'rt_list_labels',
    {
      description: 'List all labels, returns array of label JSON',
      inputSchema: {},
    },
    async () => {
      try {
        const projectId = getCurrentProjectId();
        const colRef = labelsCollection(projectId);
        const snapshot = await getDocs(colRef);
        const labels = snapshot.docs.map((d) => labelConverter.fromFirestore(d));
        return { content: [{ type: 'text', text: toJson(labels) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'rt_add_label_to_issue',
    {
      description: 'Add a label to an issue, returns updated issue JSON',
      inputSchema: {
        issueId: z.string().describe('Issue ID'),
        labelName: z.string().describe('Label name to add'),
      },
    },
    async (args) => {
      try {
        const issue = await getIssue(args.issueId);

        if (issue.labels.includes(args.labelName)) {
          return errorResult(new Error(`Issue ${args.issueId} already has label "${args.labelName}"`));
        }

        const updated = await updateIssue(args.issueId, { labels: [...issue.labels, args.labelName] });
        return { content: [{ type: 'text', text: toJson(updated) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'rt_remove_label_from_issue',
    {
      description: 'Remove a label from an issue, returns updated issue JSON',
      inputSchema: {
        issueId: z.string().describe('Issue ID'),
        labelName: z.string().describe('Label name to remove'),
      },
    },
    async (args) => {
      try {
        const issue = await getIssue(args.issueId);

        if (!issue.labels.includes(args.labelName)) {
          return errorResult(new Error(`Issue ${args.issueId} does not have label "${args.labelName}"`));
        }

        const updated = await updateIssue(args.issueId, {
          labels: issue.labels.filter((l) => l !== args.labelName),
        });
        return { content: [{ type: 'text', text: toJson(updated) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
