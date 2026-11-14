import { z } from "zod";

export const createUserSchema = z.object({
  username:    z.string().min(1).max(64),
  displayName: z.string().max(120).optional(),
  email:       z.string().email().optional(),
  isAdmin:     z.boolean().optional().default(false),
  active:      z.boolean().optional().default(true),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  displayName: z.string().max(120).optional(),
  email:       z.string().email().optional(),
  isAdmin:     z.boolean().optional(),
  active:      z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
