import type { NewsItem, NewsKind, World } from "./types";

export function addNews(w: World, kind: NewsKind, title: string, body: string, extra: Partial<NewsItem> = {}): NewsItem {
  const n: NewsItem = { id: w.nextId++, day: w.day, season: w.season, kind, title, body, read: false, ...extra };
  w.news.unshift(n);
  if (w.news.length > 150) w.news.length = 150;
  return n;
}

export function unreadCount(w: World): number {
  return w.news.reduce((s, n) => s + (n.read ? 0 : 1), 0);
}
