import { z } from "zod";

const ConfigSchema = z.object({
  PORT: z
    .string()
    .regex(/^\d+$/u)
    .default("3000")
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535)),
});
export class ConfigurationError extends Error {
  constructor() {
    super("PORT must be an integer from 1 to 65535");
  }
}

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) throw new ConfigurationError();
  return { hostname: "127.0.0.1" as const, port: result.data.PORT };
}
