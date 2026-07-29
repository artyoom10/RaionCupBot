import { z } from "zod";

export const uuidSchema = z.uuid();

export const favoriteTeamSchema = z.object({
  teamId: uuidSchema.nullable()
});

export const teamMutationSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(2).max(120),
  shortName: z.string().trim().min(2).max(24),
  city: z.string().trim().max(80).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  displayOrder: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional()
});

export const matchMutationSchema = z.object({
  id: uuidSchema.optional(),
  round: z.number().int().min(1).max(40),
  kickoffAt: z.string().datetime().nullable().optional(),
  venue: z.string().trim().max(160).nullable().optional(),
  homeTeamId: uuidSchema,
  awayTeamId: uuidSchema
});

export const playerMutationSchema = z.object({
  id: uuidSchema.optional(),
  teamId: uuidSchema,
  fullName: z.string().trim().min(2).max(120)
});

export const goalEventSchema = z.object({
  teamId: uuidSchema,
  scorerPlayerId: uuidSchema,
  assistPlayerId: uuidSchema.nullable(),
  eventType: z.enum(["goal", "penalty", "own_goal"])
});

export const resultMutationSchema = z.object({
  matchId: uuidSchema,
  resultType: z.enum(["normal", "technical_home", "technical_away", "technical_both"]),
  goalEvents: z.array(goalEventSchema).max(40),
  idempotencyKey: z.string().trim().min(8).max(120)
});
