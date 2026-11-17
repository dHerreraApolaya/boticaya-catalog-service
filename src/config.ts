import { z } from "zod";

const portSchema = z.coerce.number().int().min(1).max(65535);
const booleanSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const environmentSchema = z
  .object({
    BOTICAYA_DB_HOST: z.string().min(1).default("localhost"),
    BOTICAYA_DB_PORT: portSchema.default(5432),
    BOTICAYA_DB_NAME: z.string().min(1).default("boticaya_dev"),
    BOTICAYA_DB_USER: z.string().min(1),
    BOTICAYA_DB_PASSWORD: z.string().min(1),
    BOTICAYA_DB_SSL: booleanSchema.default(false),
    BOTICAYA_DB_CA_FILE: z.string().min(1).optional(),
    BOTICAYA_DB_CA_PEM: z.string().min(1).optional(),
    BOTICAYA_HOST: z.string().min(1).default("127.0.0.1"),
    PORT: portSchema.default(8081),
    BOTICAYA_ORDERS_ENABLED: booleanSchema.default(false),
  })
  .superRefine((config, context) => {
    if (config.BOTICAYA_DB_CA_FILE && config.BOTICAYA_DB_CA_PEM) {
      context.addIssue({ code: "custom", path: ["BOTICAYA_DB_CA_PEM"], message: "Choose one CA source" });
    }
    const loopback = ["localhost", "127.0.0.1", "::1"].includes(
      config.BOTICAYA_DB_HOST,
    );
    if ((!loopback || config.BOTICAYA_DB_CA_FILE || config.BOTICAYA_DB_CA_PEM) && !config.BOTICAYA_DB_SSL) {
      context.addIssue({
        code: "custom",
        path: ["BOTICAYA_DB_SSL"],
        message: "TLS is required",
      });
    }
  });

export function readConfig(environment: NodeJS.ProcessEnv) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Invalid environment variables: ${fields}`);
  }
  return result.data;
}

export type ApiConfig = ReturnType<typeof readConfig>;
