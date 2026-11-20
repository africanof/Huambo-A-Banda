import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

/** Muxima: publicações curtas (texto + bairro) com «gostos». */
export interface Post {
  id: string;
  name: string;
  bairro: string;
  text: string;
  likes: number;
  at: number;
}

export interface PostRepository {
  latest(limit: number): Promise<Post[]>;
  create(characterId: string, name: string, bairro: string, text: string): Promise<Post>;
  /** Devolve false se esta pessoa já tinha gostado. */
  like(postId: string, characterId: string): Promise<boolean>;
}

export class MemoryPostRepository implements PostRepository {
  private readonly posts: Post[] = [];
  private readonly liked = new Set<string>();
  async latest(limit: number): Promise<Post[]> {
    return this.posts.slice(-limit).reverse();
  }
  async create(_c: string, name: string, bairro: string, text: string): Promise<Post> {
    const p = { id: randomUUID(), name, bairro, text, likes: 0, at: Date.now() };
    this.posts.push(p);
    if (this.posts.length > 500) this.posts.splice(0, this.posts.length - 500);
    return p;
  }
  async like(postId: string, characterId: string): Promise<boolean> {
    const p = this.posts.find((x) => x.id === postId);
    const k = `${postId}:${characterId}`;
    if (!p || this.liked.has(k)) return false;
    this.liked.add(k);
    p.likes++;
    return true;
  }
}

export class SupabasePostRepository implements PostRepository {
  constructor(private readonly db: SupabaseClient) {}
  async latest(limit: number): Promise<Post[]> {
    const { data, error } = await this.db.from("game_posts").select("id,name,bairro,text,likes,created_at").order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(`game_posts.select: ${error.message}`);
    return (data ?? []).map((r) => ({ id: String(r.id), name: String(r.name), bairro: String(r.bairro), text: String(r.text), likes: Number(r.likes), at: Date.parse(String(r.created_at)) }));
  }
  async create(characterId: string, name: string, bairro: string, text: string): Promise<Post> {
    const { data, error } = await this.db.from("game_posts").insert({ character_id: characterId, name, bairro, text }).select("id,name,bairro,text,likes,created_at").single();
    if (error) throw new Error(`game_posts.insert: ${error.message}`);
    return { id: String(data.id), name: String(data.name), bairro: String(data.bairro), text: String(data.text), likes: Number(data.likes), at: Date.parse(String(data.created_at)) };
  }
  async like(postId: string, characterId: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("game_post_like", { p_post_id: postId, p_character_id: characterId });
    if (error) throw new Error(`game_post_like: ${error.message}`);
    return data === true;
  }
}
