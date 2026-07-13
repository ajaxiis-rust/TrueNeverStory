import { z } from 'zod';

// ─── Intent Schemas ──────────────────────────────────────────────────────────

const MovementIntent = z.object({
  type: z.literal('movement'),
  destination: z.string().min(1),
  speed: z.enum(['walk', 'run', 'travel']).default('walk'),
  reason: z.string().optional(),
});

const DialogueIntent = z.object({
  type: z.literal('dialogue'),
  target: z.string().min(1),
  content: z.string().min(1),
  tone: z.enum(['neutral', 'aggressive', 'friendly', 'secret', 'deceptive']).optional(),
});

const ActionIntent = z.object({
  type: z.literal('action'),
  verb: z.string().min(1),
  target: z.string().optional(),
  modifiers: z.array(z.string()).optional(),
  risk_level: z.enum(['safe', 'moderate', 'dangerous', 'deadly']).optional(),
});

const CommandIntent = z.object({
  type: z.literal('command'),
  command: z.enum([
    'look', 'inventory', 'craft', 'status', 'quests',
    'time', 'save', 'quit', 'party', 'attack',
  ]),
  args: z.record(z.string()).optional(),
});

const ObservationIntent = z.object({
  type: z.literal('observation'),
  target: z.string().optional(),
  detail_level: z.enum(['brief', 'thorough', 'examine']).default('brief'),
});

const MetaIntent = z.object({
  type: z.literal('meta'),
  action: z.enum(['help', 'settings', 'debug']),
});

export const IntentSchema = z.discriminatedUnion('type', [
  MovementIntent,
  DialogueIntent,
  ActionIntent,
  CommandIntent,
  ObservationIntent,
  MetaIntent,
]);

export type Intent = z.infer<typeof IntentSchema>;

export type IntentType = Intent['type'];

// ─── Intent Helpers ──────────────────────────────────────────────────────────

export interface ParserContext {
  currentLocation: string;
  activeCharacter: string | null;
  nearbyNpcs: string[];
  activeQuests: string[];
  gameTime: Date;
}

export function isMovementIntent(intent: Intent): intent is z.infer<typeof MovementIntent> {
  return intent.type === 'movement';
}

export function isDialogueIntent(intent: Intent): intent is z.infer<typeof DialogueIntent> {
  return intent.type === 'dialogue';
}

export function isActionIntent(intent: Intent): intent is z.infer<typeof ActionIntent> {
  return intent.type === 'action';
}

export function isCommandIntent(intent: Intent): intent is z.infer<typeof CommandIntent> {
  return intent.type === 'command';
}

export function isObservationIntent(intent: Intent): intent is z.infer<typeof ObservationIntent> {
  return intent.type === 'observation';
}

export function isMetaIntent(intent: Intent): intent is z.infer<typeof MetaIntent> {
  return intent.type === 'meta';
}
