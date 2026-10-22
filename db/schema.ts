import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { BriefContent, BriefEvidence } from '../lib/brief-types';
import type { LocalInventory } from '../lib/local-agent-types';

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

// Device tokens and pairing codes are stored only as SHA-256 hashes.
export const localAgentDevices = sqliteTable('local_agent_devices', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  pairingHash: text('pairing_hash'),
  pairingExpiresAt: text('pairing_expires_at').notNull(),
  tokenHash: text('token_hash'),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
  lastSeenAt: text('last_seen_at'),
  inventory: text('inventory', { mode: 'json' }).$type<LocalInventory>(),
}, table => [
  index('local_agent_owner_expiry').on(table.userId, table.expiresAt),
  uniqueIndex('local_agent_pairing_hash').on(table.pairingHash),
  uniqueIndex('local_agent_token_hash').on(table.tokenHash),
]);
