import { z } from 'zod';

export const agentIdSchema = z.enum(['codex', 'claude']);
const label = z.string().trim().min(1).max(200);
export const localSkillSchema = z.object({
  id: z.string().min(1).max(100), name: label,
  description: z.string().max(2000),
  scope: z.enum(['project', 'user', 'plugin', 'system']),
  source: z.string().max(500), plugin: z.string().max(200).nullable(),
  status: z.enum(['recognized', 'configured', 'disabled', 'shadowed', 'unverified']),
  evidence: z.string().max(500), hash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).strict();
const projectSchema = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), name: label, branch: z.string().max(200).nullable() }).strict();
const runtimeSchema = z.object({
  id: agentIdSchema, version: z.string().max(100).nullable(),
  status: z.enum(['ready', 'partial', 'unavailable']),
  skills: z.array(localSkillSchema).max(1000), warnings: z.array(z.string().max(500)).max(30),
}).strict();
export const localInventorySchema = z.union([z.object({
  protocolVersion: z.literal(1), observedAt: z.string().datetime(),
  project: projectSchema, agents: z.array(runtimeSchema).length(2),
}).strict(), z.object({
  protocolVersion: z.literal(2), observedAt: z.string().datetime(),
  profileId: z.string().uuid(), context: z.object({ kind: z.literal('personal') }).strict(),
  project: z.null(), agents: z.array(runtimeSchema).min(1).max(2),
}).strict()]).refine(value => new Set(value.agents.map(agent => agent.id)).size === value.agents.length, '에이전트 목록이 중복됐습니다.');

export const pairingClaimSchema = z.object({ code: z.string().regex(/^[a-f0-9]{48}$/), name: label }).strict();
export type LocalInventory = z.infer<typeof localInventorySchema>;
export type LocalSkill = z.infer<typeof localSkillSchema>;
export type LocalDevice = {
  id: string; name: string; createdAt: string; lastSeenAt: string | null;
  expiresAt: string; inventory: LocalInventory | null;
};
export type LocalDeviceList = { devices: LocalDevice[] };
export type LocalPairing = { id: string; code: string; expiresAt: string };
