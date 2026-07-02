/**
 * Chat request/response models (replaces Pydantic models from chat.py).
 */
import { z } from "zod";

export const ChatMessageSchema = z.object({
  content: z.string().min(1, "Message content is required").max(8000, "Message too long (max 8000 chars)"),
  character: z.string().optional(),
  location: z.string().optional(),
  session_id: z.string().optional(),
  story_time: z.string().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatResponseSchema = z.object({
  narrative: z.string(),
  location: z.string().default(""),
  story_time: z.string().default(""),
  active_character: z.string().optional().nullable(),
  entities_mentioned: z.array(z.string()).default([]),
  success: z.boolean().default(true),
  error: z.string().optional().nullable(),
});

export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const SessionSetupSchema = z.object({
  character: z.string().optional().nullable(),
  location: z.string().default("unknown"),
  story_time: z.string().optional().nullable(),
  role: z.string().default("protagonist"),
  session_id: z.string().optional().nullable(),
});

export type SessionSetup = z.infer<typeof SessionSetupSchema>;

export const SessionInfoSchema = z.object({
  active_character: z.string().optional().nullable(),
  current_location: z.string(),
  current_time: z.string(),
  session_id: z.string().optional().nullable(),
});

export type SessionInfo = z.infer<typeof SessionInfoSchema>;
