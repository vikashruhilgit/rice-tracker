import { collection, CollectionReference } from 'firebase/firestore';
import { getDb } from './client.js';

export function getProjectPath(projectId: string): string {
  return `projects/${projectId}`;
}

export function issuesCollection(projectId: string): CollectionReference {
  return collection(getDb(), getProjectPath(projectId), 'issues');
}

export function dependenciesCollection(projectId: string): CollectionReference {
  return collection(getDb(), getProjectPath(projectId), 'dependencies');
}

export function commentsCollection(projectId: string): CollectionReference {
  return collection(getDb(), getProjectPath(projectId), 'comments');
}

export function labelsCollection(projectId: string): CollectionReference {
  return collection(getDb(), getProjectPath(projectId), 'labels');
}

export function eventsCollection(projectId: string): CollectionReference {
  return collection(getDb(), getProjectPath(projectId), 'events');
}

export function archivedCollection(projectId: string): CollectionReference {
  return collection(getDb(), getProjectPath(projectId), 'archived');
}
