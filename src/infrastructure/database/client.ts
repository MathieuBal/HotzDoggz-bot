import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../../config/env.js';

const env = loadEnv();

/**
 * Client Prisma unique (PostgreSQL = source officielle, CDC §6.1).
 * Singleton pour eviter d'epuiser le pool de connexions, notamment en dev/HMR.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
