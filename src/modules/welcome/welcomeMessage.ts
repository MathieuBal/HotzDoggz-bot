/**
 * Rendu du message d'accueil RP (pur, sans I/O ni Prisma : testable et
 * importable partout). Le texte est personnalisable cote direction ; a defaut,
 * on utilise le message ci-dessous.
 *
 * Placeholders supportes :
 *   {membre}  -> mention du nouvel arrivant
 *   {serveur} -> nom du serveur
 */
export const DEFAULT_WELCOME_MESSAGE =
  'Salut {membre} ! 🌭 Bienvenue au **HotzDogz**. ' +
  'Installe-toi, présente-toi à l’équipe, et si tu as un petit creux, ' +
  'passe commande — on s’occupe du reste !';

export interface WelcomeContext {
  mention: string;
  guildName: string;
}

/** Remplace les placeholders connus dans le gabarit. */
export function renderWelcomeMessage(template: string | null, ctx: WelcomeContext): string {
  const raw = template && template.trim().length > 0 ? template : DEFAULT_WELCOME_MESSAGE;
  return raw.replaceAll('{membre}', ctx.mention).replaceAll('{serveur}', ctx.guildName);
}
