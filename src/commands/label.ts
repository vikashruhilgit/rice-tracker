import { Command } from 'commander';
import { doc, setDoc, getDocs, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
import type { Label } from '../types/index.js';
import { validateLabel, labelConverter } from '../models/label.js';
import { labelsCollection, issuesCollection } from '../firebase/collections.js';
import { issueConverter } from '../models/issue.js';
import { generateId } from '../utils/id-generator.js';
import { getCurrentProjectId } from '../utils/config.js';
import { outputResult } from '../utils/formatter.js';

async function resolveLabelByName(projectId: string, name: string): Promise<Label | null> {
  const colRef = labelsCollection(projectId);
  const q = query(colRef, where('name', '==', name));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return labelConverter.fromFirestore(snap.docs[0]);
}

async function resolveLabelById(projectId: string, labelId: string): Promise<{ docId: string; label: Label } | null> {
  const colRef = labelsCollection(projectId);
  const q = query(colRef, where('labelId', '==', labelId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { docId: snap.docs[0].id, label: labelConverter.fromFirestore(snap.docs[0]) };
}

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

      const labelId = generateId();
      const label: Label = {
        id: labelId,
        labelId,
        name,
        color: opts.color,
        description: opts.description,
      };

      const docRef = doc(colRef, label.id);
      await setDoc(docRef, labelConverter.toFirestore(label));

      if (opts.json) {
        outputResult(label, true);
      } else {
        console.log(`Label "${name}" created (${label.color}) — ID: ${labelId}`);
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
            console.log(`  ${label.labelId}  ${label.name} (${label.color})${label.description ? ' - ' + label.description : ''}`);
          }
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

const labelDelete = new Command('delete')
  .description('Delete a label by ID and cascade removal from all issues')
  .argument('<labelId>', 'Label ID (rt-xxxx format) or label name')
  .option('--json', 'Output as JSON', false)
  .action(async (labelId: string, opts) => {
    try {
      const projectId = getCurrentProjectId();

      // Resolve: try by labelId first, then by name for backwards compat
      let resolved = await resolveLabelById(projectId, labelId);
      if (!resolved) {
        // Try by name
        const byName = await resolveLabelByName(projectId, labelId);
        if (byName) {
          resolved = { docId: byName.id, label: byName };
        }
      }

      if (!resolved) {
        console.error(`Error: Label "${labelId}" not found`);
        process.exit(1);
      }

      const { docId, label } = resolved;
      const colRef = labelsCollection(projectId);

      // Delete the label document
      await deleteDoc(doc(colRef, docId));

      // Cascade: remove labelId from all issues that reference it
      const issueColRef = issuesCollection(projectId);
      const issueQuery = query(issueColRef, where('labelIds', 'array-contains', label.labelId));
      const issueSnap = await getDocs(issueQuery);

      for (const issueDoc of issueSnap.docs) {
        const issueData = issueConverter.fromFirestore(issueDoc);
        const updatedLabelIds = issueData.labelIds.filter((id) => id !== label.labelId);
        await updateDoc(issueDoc.ref, { labelIds: updatedLabelIds });
      }

      if (opts.json) {
        outputResult({ deleted: label.labelId, name: label.name, cascaded: issueSnap.size }, true);
      } else {
        console.log(`Label "${label.name}" (${label.labelId}) deleted${issueSnap.size > 0 ? `, removed from ${issueSnap.size} issue(s)` : ''}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

const labelRename = new Command('rename')
  .description('Rename a label by ID (issues keep their reference via ID — no cascade needed)')
  .argument('<labelId>', 'Label ID (rt-xxxx format)')
  .argument('<newName>', 'New label name')
  .option('--json', 'Output as JSON', false)
  .action(async (labelId: string, newName: string, opts) => {
    try {
      const projectId = getCurrentProjectId();
      const resolved = await resolveLabelById(projectId, labelId);

      if (!resolved) {
        console.error(`Error: Label "${labelId}" not found`);
        process.exit(1);
      }

      const colRef = labelsCollection(projectId);

      // Check no duplicate name
      const dupQuery = query(colRef, where('name', '==', newName));
      const dupSnap = await getDocs(dupQuery);
      if (!dupSnap.empty && dupSnap.docs[0].id !== resolved.docId) {
        console.error(`Error: Label "${newName}" already exists`);
        process.exit(1);
      }

      await updateDoc(doc(colRef, resolved.docId), { name: newName });
      const updated = { ...resolved.label, name: newName };

      if (opts.json) {
        outputResult(updated, true);
      } else {
        console.log(`Label "${resolved.label.name}" renamed to "${newName}" (ID: ${labelId})`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

const labelAdd = new Command('add')
  .description('Add a label to an issue (by label name)')
  .argument('<issueId>', 'Issue ID')
  .argument('<labelName>', 'Label name')
  .option('--json', 'Output as JSON', false)
  .action(async (issueId: string, labelName: string, opts) => {
    try {
      const projectId = getCurrentProjectId();
      const label = await resolveLabelByName(projectId, labelName);

      if (!label) {
        console.error(`Error: Label "${labelName}" not found. Create it first with: rt label create "${labelName}"`);
        process.exit(1);
      }

      const issueColRef = issuesCollection(projectId);
      const issueQuery = query(issueColRef, where('id', '==', issueId));
      const issueSnap = await getDocs(issueQuery);

      if (issueSnap.empty) {
        console.error(`Error: Issue ${issueId} not found`);
        process.exit(1);
      }

      const issueDoc = issueSnap.docs[0];
      const issueData = issueConverter.fromFirestore(issueDoc);

      if (issueData.labelIds.includes(label.labelId)) {
        console.error(`Error: Issue ${issueId} already has label "${labelName}"`);
        process.exit(1);
      }

      const updatedLabelIds = [...issueData.labelIds, label.labelId];
      await updateDoc(issueDoc.ref, { labelIds: updatedLabelIds });

      if (opts.json) {
        outputResult({ ...issueData, labelIds: updatedLabelIds }, true);
      } else {
        console.log(`Added label "${labelName}" (${label.labelId}) to ${issueId}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

const labelRemove = new Command('remove')
  .description('Remove a label from an issue (by label name)')
  .argument('<issueId>', 'Issue ID')
  .argument('<labelName>', 'Label name')
  .option('--json', 'Output as JSON', false)
  .action(async (issueId: string, labelName: string, opts) => {
    try {
      const projectId = getCurrentProjectId();
      const label = await resolveLabelByName(projectId, labelName);

      if (!label) {
        console.error(`Error: Label "${labelName}" not found`);
        process.exit(1);
      }

      const issueColRef = issuesCollection(projectId);
      const issueQuery = query(issueColRef, where('id', '==', issueId));
      const issueSnap = await getDocs(issueQuery);

      if (issueSnap.empty) {
        console.error(`Error: Issue ${issueId} not found`);
        process.exit(1);
      }

      const issueDoc = issueSnap.docs[0];
      const issueData = issueConverter.fromFirestore(issueDoc);

      if (!issueData.labelIds.includes(label.labelId)) {
        console.error(`Error: Issue ${issueId} does not have label "${labelName}"`);
        process.exit(1);
      }

      const updatedLabelIds = issueData.labelIds.filter((id) => id !== label.labelId);
      await updateDoc(issueDoc.ref, { labelIds: updatedLabelIds });

      if (opts.json) {
        outputResult({ ...issueData, labelIds: updatedLabelIds }, true);
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
  .addCommand(labelRename)
  .addCommand(labelAdd)
  .addCommand(labelRemove);
