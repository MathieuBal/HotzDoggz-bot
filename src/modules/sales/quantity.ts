/**
 * Extraction de la quantite vendue depuis le post employe (CDC §4.1).
 *
 * Formats reconnus (regles strictes et explicables) :
 *  - Contenu : "Quantite vendue : 2 000"
 *  - Titre   : "VENTE - 2 000 hot dogs - 18/06/2026"
 *
 * Tolere les separateurs de milliers (espaces normale/insecable/fine, point).
 * Ne devine PAS une quantite a partir d'une date : retourne null si absente,
 * ce qui declenchera le statut "A completer".
 */

// Espaces "irreguliers" a normaliser (insecable, fines, etroites...).
// Construit par echappements pour ne pas placer de caracteres invisibles dans la source.
const ODD_SPACES = new RegExp('[\\u00A0\\u2007\\u2008\\u2009\\u200A\\u202F]', 'g');

// Un nombre = un groupe de chiffres pouvant contenir des espaces/points internes.
const NUMBER = '(\\d[\\d .]*\\d|\\d)';

const CONTENT_RE = new RegExp(`quantit[ée][^:\\n=]*[:=]\\s*${NUMBER}`, 'i');
const TITLE_RE = new RegExp(`vente\\s*[-–—]\\s*${NUMBER}\\s*hot`, 'i');

function toInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * @returns la quantite (> 0) ou null si aucun format reconnu.
 */
export function extractQuantity(title: string, content: string): number | null {
  const normTitle = (title ?? '').replace(ODD_SPACES, ' ');
  const normContent = (content ?? '').replace(ODD_SPACES, ' ');

  // 1) Champ explicite du contenu (prioritaire).
  const fromContent = toInt(CONTENT_RE.exec(normContent)?.[1]);
  if (fromContent !== null) return fromContent;

  // 2) Quantite dans le titre, devant "hot dog(s)".
  const fromTitle = toInt(TITLE_RE.exec(normTitle)?.[1]);
  if (fromTitle !== null) return fromTitle;

  return null;
}
