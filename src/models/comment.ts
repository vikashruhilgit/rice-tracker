import { Timestamp } from 'firebase/firestore';
import type { Comment } from '../types/index.js';

export const commentConverter = {
  toFirestore(comment: Comment) {
    return { ...comment, createdAt: Timestamp.fromDate(comment.createdAt) };
  },
  fromFirestore(snapshot: { data: () => Record<string, any> }): Comment {
    const data = snapshot.data();
    return { ...data, createdAt: data.createdAt?.toDate() ?? new Date() } as Comment;
  },
};
