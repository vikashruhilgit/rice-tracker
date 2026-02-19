import { Command } from 'commander';
import { doc, setDoc, getDocs, deleteDoc, query, where } from 'firebase/firestore';
import type { Label } from '../types/index.js';
import { validateLabel, labelConverter } from '../models/label.js';
import { labelsCollection } from '../firebase/collections.js';
import { getIssue, updateIssue } from '../services/issue-service.js';
import { generateId } from '../utils/id-generator.js';
import { getCurrentProjectId } from '../utils/config.js';
import { outputResult } from '../utils/formatter.js';

const labelCreate = new Command('create')
  .description('Create a new label')
  .argument('<name>', 'Label name')
  .option('--color <hex>', 'Label color (hex)', '#808080')
  .option('--description <text>', 'Label description', '')
  .option('--json', 'Output as JSON', false)
  .action(async (name: string, opts) => {
    try {
      const labelData: Partial<Label> = {
        name,
        color: opts.color,
        description: opts.description,
      };

      const errors = validateLabel(labelData);
      if (errors.length > 0) {
        console.error('Validation errors:', errors.join(', '));
        process.exit(1);
      }

      const projectId = getCurrentProjectId();
      const colRef = labelsCollection(projectId);

      // Check for duplicate name
      const dupQuery = query(colRef, where('name', '==', name));
      const dupSnap = await getDocs(dupQuery);
      if (!dupSnap.empty) {
        console.error(`Error: Label "${name}" already exists`);
        process.exit(1);
      }

      const label: Label = {
        id: generateId(),
        name,
        color: opts.color,
        description: opts.description,
      };

      const docRef = doc(colRef, label.id);
      await setDoc(docRef, labelConverter.toFirestore(label));

      if (opts.json) {
        outputResult(label, true);
      } else {
        console.log(`Label "${name}" created (${label.color})`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

const labelList = new Command('list')
  .description('List all labels')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const projectId = getCurrentProjectId();
      const colRef = labelsCollection(projectId);
      const snapshot = await getDocs(colRef);
      const labels = snapshot.docs.map((d) => labelConverter.fromFirestore(d));

      if (opts.json) {
        outputResult(labels, true);
      } else {
        if (labels.length === 0) {
          console.log('No labels found.');
        } else {
          for (const label of labels) {
            console.log(`  ${label.name} (${label.color})${label.description ? ' - ' + label.description : ''}`);
          }
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

const labelDelete = new Command('delete')
  .description('Delete a label')
  .argument('<name>', 'Label name')
  .option('--json', 'Output as JSON', false)
  .action(async (name: string, opts) => {
    try {
      const projectId = getCurrentProjectId();
      const colRef = labelsCollection(projectId);
      const q = query(colRef, where('name', '==', name));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        console.error(`Error: Label "${name}" not found`);
        process.exit(1);
      }

      const labelDoc = snapshot.docs[0];
      await deleteDoc(labelDoc.ref);

      if (opts.json) {
        outputResult({ deleted: name }, true);
      } else {
        console.log(`Label "${name}" deleted`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

const labelAdd = new Command('add')
  .description('Add a label to an issue')
  .argument('<issueId>', 'Issue ID')
  .argument('<labelName>', 'Label name')
  .option('--json', 'Output as JSON', false)
  .action(async (issueId: string, labelName: string, opts) => {
    try {
      const issue = await getIssue(issueId);

      if (issue.labels.includes(labelName)) {
        console.error(`Error: Issue ${issueId} already has label "${labelName}"`);
        process.exit(1);
      }

      const updatedLabels = [...issue.labels, labelName];
      const updated = await updateIssue(issueId, { labels: updatedLabels });

      if (opts.json) {
        outputResult(updated, true);
      } else {
        console.log(`Added label "${labelName}" to ${issueId}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

const labelRemove = new Command('remove')
  .description('Remove a label from an issue')
  .argument('<issueId>', 'Issue ID')
  .argument('<labelName>', 'Label name')
  .option('--json', 'Output as JSON', false)
  .action(async (issueId: string, labelName: string, opts) => {
    try {
      const issue = await getIssue(issueId);

      if (!issue.labels.includes(labelName)) {
        console.error(`Error: Issue ${issueId} does not have label "${labelName}"`);
        process.exit(1);
      }

      const updatedLabels = issue.labels.filter((l) => l !== labelName);
      const updated = await updateIssue(issueId, { labels: updatedLabels });

      if (opts.json) {
        outputResult(updated, true);
      } else {
        console.log(`Removed label "${labelName}" from ${issueId}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

export const labelCommand = new Command('label')
  .description('Manage labels')
  .addCommand(labelCreate)
  .addCommand(labelList)
  .addCommand(labelDelete)
  .addCommand(labelAdd)
  .addCommand(labelRemove);
