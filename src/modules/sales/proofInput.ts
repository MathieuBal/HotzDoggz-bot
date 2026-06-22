import { randomUUID } from 'node:crypto';
import type { Attachment } from 'discord.js';
import { type AttachmentSource, isImageAttachment } from './attachments.js';

/** Representation a (re)poster dans un thread : piece jointe Discord ou URL. */
export type ProofFile = Attachment | { attachment: string; name: string };

export type ProofResolution =
  | { ok: true; source: AttachmentSource; file: ProofFile; isLink: boolean }
  | { ok: false; reason: string };

const URL_RE = /^https?:\/\/\S+$/i;

/**
 * Resout une preuve depuis une piece jointe OU un lien (au moins un requis).
 * Cote employe : ceux qui ont un fichier le joignent, ceux qui ont un lien
 * (outil de capture externe) le collent — sans etape manuelle de re-upload.
 */
export function resolveProof(
  attachment: Attachment | null,
  link: string | null,
  label: string,
): ProofResolution {
  if (attachment) {
    if (!isImageAttachment(attachment)) {
      return { ok: false, reason: `${label} : la pièce jointe doit être une image.` };
    }
    return { ok: true, source: attachment, file: attachment, isLink: false };
  }
  const url = link?.trim();
  if (url) {
    if (!URL_RE.test(url)) {
      return { ok: false, reason: `${label} : le lien doit commencer par http(s):// .` };
    }
    return {
      ok: true,
      source: { url, id: `link-${randomUUID().slice(0, 12)}`, name: null, contentType: null },
      file: { attachment: url, name: 'preuve.png' },
      isLink: true,
    };
  }
  return { ok: false, reason: `${label} : fournis une **image** OU un **lien**.` };
}
