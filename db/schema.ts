import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { UsageAnalysis, UsageCoverage, UsageReport, UsageCandidate } from '../features/usage/usage-types';
import type { BriefContent, BriefEvidence } from '../features/editorial/brief-types';
import type { LocalInventory } from '../features/local-agent/local-agent-types';
import type { ActivitySummary, CoachBundle, CoachNarrative, CoachReport } from '../features/coach/coach-types';
import type { RepositorySnapshotManifest } from '../features/repositories/snapshot-types';
import type { RepositoryOverview } from '../features/repositories/repository-types';

export const repositorySnapshotState = sqliteTable('repository_snapshot_state', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).$type<RepositorySnapshotManifest>().notNull(),
  updatedAt: text('updated_at').notNull(),
  leaseToken: text('lease_token'),
  leaseUntil: integer('lease_until').notNull().default(0),
}, table => [index('repository_snapshot_state_updated').on(table.updatedAt)]);

export const repositorySnapshotItems = sqliteTable('repository_snapshot_items', {
  id: text('id').primaryKey(),
  version: text('version').notNull(),
  repository: text('repository').notNull(),
  evidence: text('evidence', { mode: 'json' }).$type<BriefEvidence>().notNull(),
  overview: text('overview', { mode: 'json' }).$type<RepositoryOverview>().notNull(),
  createdAt: text('created_at').notNull(),
}, table => [index('repository_snapshot_items_created').on(table.createdAt)]);

export const skillCatalogState = sqliteTable('skill_catalog_state', {
  id: text('id').primaryKey(), data: text('data', { mode: 'json' }).$type<unknown>().notNull(), updatedAt: text('updated_at').notNull(),
});
export const skillCatalogItems = sqliteTable('skill_catalog_items', {
  id: text('id').primaryKey(), data: text('data', { mode: 'json' }).$type<unknown>().notNull(),
});
export const skillCatalogSources = sqliteTable('skill_catalog_sources', {
  id: text('id').primaryKey(), data: text('data', { mode: 'json' }).$type<unknown>().notNull(),
});

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

export const agentCoachReports = sqliteTable('agent_coach_reports', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), deviceId: text('device_id'),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), expiresAt: text('expires_at').notNull(),
  status: text('status').$type<CoachReport['status']>().notNull(),
  author: text('author').$type<CoachReport['author']>().notNull(), message: text('message').notNull(),
  bundle: text('bundle', { mode: 'json' }).$type<CoachBundle>().notNull(),
  narrative: text('narrative', { mode: 'json' }).$type<CoachNarrative>().notNull(),
  feedback: text('feedback', { mode: 'json' }).$type<CoachReport['feedback']>().notNull(),
  leaseHash: text('lease_hash'), leaseExpiresAt: text('lease_expires_at'),
}, table => [index('agent_coach_owner_expiry').on(table.userId, table.expiresAt), index('agent_coach_device_status').on(table.deviceId, table.status)]);

export const agentActivitySummaries = sqliteTable('agent_activity_summaries', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), deviceId: text('device_id').notNull(),
  createdAt: text('created_at').notNull(), expiresAt: text('expires_at').notNull(),
  summary: text('summary', { mode: 'json' }).$type<ActivitySummary['summary']>().notNull(),
}, table => [index('agent_activity_owner_expiry').on(table.userId, table.expiresAt)]);

export const agentUsageRuns = sqliteTable('agent_usage_runs', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), deviceId: text('device_id'),
  executor: text('executor').$type<'local' | 'agent'>().notNull().default('local'),
  goal: text('goal').notNull(), selectedSkillIds: text('selected_skill_ids', { mode: 'json' }).$type<string[]>().notNull(),
  status: text('status').$type<'queued' | 'running' | 'completed' | 'failed' | 'canceled'>().notNull(),
  revision: integer('revision').notNull().default(0),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), expiresAt: text('expires_at').notNull(),
  message: text('message').notNull(),
  analysis: text('analysis', { mode: 'json' }).$type<UsageAnalysis>(),
  coverage: text('coverage', { mode: 'json' }).$type<UsageCoverage>(),
  candidates: text('candidates', { mode: 'json' }).$type<UsageCandidate[]>().notNull(),
  report: text('report', { mode: 'json' }).$type<UsageReport>(),
  leaseHash: text('lease_hash'), leaseExpiresAt: text('lease_expires_at'),
  activeDeviceKey: text('active_device_key'),
}, table => [index('agent_usage_owner_expiry').on(table.userId, table.expiresAt), index('agent_usage_device_status').on(table.deviceId, table.status), uniqueIndex('agent_usage_active_device').on(table.activeDeviceKey)]);
