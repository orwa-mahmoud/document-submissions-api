import { z } from "zod";

export const createSubmissionSchema = z
  .object({
    title: z.string().min(1).max(200),
    category: z.string().min(1).max(50),
    body: z.string().min(1).max(20000),
    reference_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

export const changeStatusSchema = z
  .object({
    status: z.enum(["pending", "under_review", "approved", "rejected"]),
  })
  .strict();

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
