import { Post, ShieldClassification } from '@/types';
import { INITIAL_POSTS } from './mockData';
import { distributedStore } from '../security/distributedStore';

const POSTS_STORAGE_KEY = 'platform:posts';

export class PostsStore {
  private inMemoryPosts: Post[] = [...INITIAL_POSTS];

  public async getAllPosts(): Promise<Post[]> {
    if (distributedStore.isConfigured()) {
      const raw = await distributedStore.get(POSTS_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Post[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch {
          // Fall through to memory
        }
      }
    }
    return this.inMemoryPosts;
  }

  public async getPublicPosts(): Promise<Post[]> {
    const all = await this.getAllPosts();
    return all.filter((p) => !p.isShielded && p.shieldCategory !== 'quarantined' && p.shieldCategory !== 'rejected');
  }

  public async getAdultAuthorizedPosts(): Promise<Post[]> {
    const all = await this.getAllPosts();
    return all.filter((p) => p.shieldCategory !== 'quarantined' && p.shieldCategory !== 'rejected');
  }

  public async addPost(post: Post): Promise<Post> {
    const current = await this.getAllPosts();
    const updated = [post, ...current];
    this.inMemoryPosts = updated;

    if (distributedStore.isConfigured()) {
      await distributedStore.set(POSTS_STORAGE_KEY, JSON.stringify(updated), 7 * 24 * 60 * 60).catch(() => {});
    }

    return post;
  }

  public async quarantinePost(postId: string, reason: string): Promise<boolean> {
    const all = await this.getAllPosts();
    let modified = false;

    const updated = all.map((post) => {
      if (post.id === postId) {
        modified = true;
        return {
          ...post,
          isShielded: true,
          shieldCategory: 'quarantined' as ShieldClassification,
          shieldReason: reason,
        };
      }
      return post;
    });

    if (modified) {
      this.inMemoryPosts = updated;
      if (distributedStore.isConfigured()) {
        await distributedStore.set(POSTS_STORAGE_KEY, JSON.stringify(updated), 7 * 24 * 60 * 60).catch(() => {});
      }
    }

    return modified;
  }

  public resetToDefault(): void {
    this.inMemoryPosts = [...INITIAL_POSTS];
  }
}

export const postsStore = new PostsStore();
