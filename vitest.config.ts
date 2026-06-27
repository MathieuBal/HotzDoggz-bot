import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Environnement de test autosuffisant : certains modules importent le client
    // Prisma, qui valide l'env a l'import (loadEnv). En CI il n'y a pas de .env ;
    // on fournit donc des valeurs factices. Aucune connexion reelle n'est ouverte
    // (les tests mockent Prisma ou n'appellent que des fonctions pures).
    env: {
      DISCORD_TOKEN: 'test-token',
      DISCORD_CLIENT_ID: 'test-client-id',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test?schema=public',
    },
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/*.ts'],
    },
  },
});
