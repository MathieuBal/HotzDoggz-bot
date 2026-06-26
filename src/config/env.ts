import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

/**
 * Schema de validation stricte des variables d'environnement (CDC §8.1 : Zod).
 * Les secrets ne vivent que dans l'environnement, jamais dans le code (§10.1).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TIMEZONE: z.string().min(1).default('Europe/Paris'),

  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN est requis'),
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID est requis'),
  DISCORD_GUILD_ID: z.string().optional(),

  DATABASE_URL: z.string().url('DATABASE_URL doit etre une URL postgresql valide'),

  // Stockage objet des preuves (§5.3). Repli fichier local par defaut.
  STORAGE_DIR: z.string().min(1).default('./storage'),
  // Retention des preuves images (jours) : au-dela, purge auto pour ne pas
  // saturer le disque. Les photos durables (menu, vehicules) sont preservees.
  STORAGE_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Charge et valide l'environnement (une seule fois). Echoue tot et clairement
 * si une variable requise manque, plutot que de planter en plein vol.
 */
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(racine)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration d'environnement invalide :\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
