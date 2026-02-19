import type { Issue } from '../types/index.js';

export function isEpic(issue: Issue): boolean {
  return issue.type === 'epic';
}

export function getEpicChildId(parentId: string, childIndex: number): string {
  return `${parentId}.${childIndex}`;
}

export function getNextChildIndex(existingChildren: Issue[]): number {
  if (existingChildren.length === 0) return 1;
  const maxIndex = Math.max(...existingChildren.map(c => c.childIndex ?? 0));
  return maxIndex + 1;
}
