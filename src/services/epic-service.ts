import {
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import type { Issue } from '../types/index.js';
import { issuesCollection } from '../firebase/collections.js';
import { getCurrentProjectId } from '../utils/config.js';
import { getIssue } from './issue-service.js';
import { isEpic, getNextChildIndex } from '../models/epic.js';
import { issueConverter } from '../models/issue.js';

/**
 * Fetch all children of an epic, ordered by childIndex.
 */
export async function getEpicChildren(epicId: string): Promise<Issue[]> {
  const projectId = getCurrentProjectId();
  const colRef = issuesCollection(projectId);
  const childrenQuery = query(
    colRef,
    where('parentId', '==', epicId),
    orderBy('childIndex', 'asc'),
  );
  const childrenSnap = await getDocs(childrenQuery);
  return childrenSnap.docs.map((d) => issueConverter.fromFirestore(d));
}

/**
 * Add a child issue to an epic. Validates both issues exist and epic is correct type.
 * Returns the updated child issue.
 */
export async function addChildToEpic(epicId: string, childId: string): Promise<Issue> {
  const epic = await getIssue(epicId);

  if (!isEpic(epic)) {
    throw new Error(`Issue ${epicId} is not an epic (type: ${epic.type})`);
  }

  const child = await getIssue(childId);

  if (child.parentId) {
    throw new Error(`Issue ${childId} already belongs to parent ${child.parentId}`);
  }

  // Get existing children to determine next index
  const children = await getEpicChildren(epicId);
  const nextIndex = getNextChildIndex(children);

  // Update child issue with parentId and childIndex
  const projectId = getCurrentProjectId();
  const colRef = issuesCollection(projectId);
  const childDocRef = doc(colRef, childId);
  await updateDoc(childDocRef, {
    parentId: epicId,
    childIndex: nextIndex,
    updatedAt: Timestamp.fromDate(new Date()),
  });

  return { ...child, parentId: epicId, childIndex: nextIndex };
}
