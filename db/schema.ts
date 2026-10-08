import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(), title: text('title').notNull(), category: text('category').notNull(),
  tags: text('tags').notNull(), publishedAt: text('published_at'), content: text('content').notNull(),
  excerpt: text('excerpt').notNull(), frontmatter: text('frontmatter').notNull(),
  status: text('status').notNull().default('draft'), version: integer('version').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
}, table => [index('posts_listing_idx').on(table.status, table.publishedAt, table.id), index('posts_category_idx').on(table.category)]);
export const settings = sqliteTable('settings', { key: text('key').primaryKey(), value: text('value').notNull() });
