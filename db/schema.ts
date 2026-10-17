import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { BriefContent, BriefEvidence } from '../lib/brief-types';

export const editorialSources = sqliteTable('editorial_sources', {
  id: text('id').primaryKey(),
  fingerprint: text('fingerprint').notNull(),
  evidence: text('evidence', { mode: 'json' }).$type<BriefEvidence>().notNull(),
  fetchedAt: text('fetched_at').notNull(),
});

export const repositoryBriefs = sqliteTable('repository_briefs', {
  id: text('id').primaryKey(),
  fingerprint: text('fingerprint').notNull(),
  evidence: text('evidence', { mode: 'json' }).$type<BriefEvidence>().notNull(),
  content: text('content', { mode: 'json' }).$type<BriefContent>().notNull(),
  generatedAt: text('generated_at').notNull(),
});
