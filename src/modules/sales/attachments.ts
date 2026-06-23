import type { AttachmentType } from '@prisma/client';
import type { Attachment } from 'discord.js';
import { getObjectStorage } from '../../infrastructure/object-storage/factory.js';
import { sha256 } from '../../infrastructure/object-storage/filesystem.js';

/** Une piece jointe est consideree image si MIME image/* ou dimensions presentes. */
export function isImageAttachment(att: Attachment): boolean {
  return (att.contentType?.startsWith('image/') ?? false) || att.width != null;
}

/**
 * Source generique d'une preuve : une piece jointe Discord OU un lien fourni par
 * l'employe. Le type `Attachment` de discord.js satisfait structurellement cette
 * interface (url, id, name, contentType).
 */
export interface AttachmentSource {
  url: string;
  id: string;
  name: string | null;
  contentType: string | null;
}

/** Le contenu telecharge n'est pas une image (lien errone : page web, etc.). */
export class NotAnImageError extends Error {
  constructor() {
    super('Le lien ne pointe pas directement vers une image.');
    this.name = 'NotAnImageError';
  }
}

const MAX_BYTES = 25 * 1024 * 1024; // garde-fou taille (25 Mo)

export interface StoredAttachment {
  type: AttachmentType;
  discordMessageId: string;
  discordAttachmentId: string;
  fileName: string;
  size: number;
  mimeType: string;
  sha256: string;
  storageKey: string;
  discordUrl: string;
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function extensionFor(fileName: string | null, mime: string): string {
  const fromName = fileName?.split('.').pop();
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/i.test(fromName)) {
    return fromName.toLowerCase();
  }
  return MIME_EXT[mime] ?? 'bin';
}

/**
 * Telecharge une preuve (piece jointe OU lien) et la copie dans le stockage
 * durable (CDC §5.3). Le type MIME est determine par la source, sinon par
 * l'en-tete HTTP. Refuse ce qui n'est pas une image (lien errone).
 */
export async function downloadAndStore(params: {
  guildId: string;
  threadId: string;
  type: AttachmentType;
  messageId: string;
  attachment: AttachmentSource;
}): Promise<StoredAttachment> {
  const { attachment } = params;
  const res = await fetch(attachment.url);
  if (!res.ok) {
    throw new Error(`Telechargement de la preuve echoue (HTTP ${res.status})`);
  }
  const headerType = res.headers.get('content-type')?.split(';')[0]?.trim() || null;
  const mimeType = attachment.contentType ?? headerType ?? 'application/octet-stream';
  if (!mimeType.startsWith('image/')) {
    throw new NotAnImageError();
  }
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX_BYTES) {
    throw new Error('Fichier trop volumineux (max 25 Mo).');
  }
  const ext = extensionFor(attachment.name, mimeType);
  const slug = params.type.toLowerCase();
  const storageKey = `${params.guildId}/${params.threadId}/${slug}-${attachment.id}.${ext}`;

  await getObjectStorage().put({ key: storageKey, body, contentType: mimeType });

  return {
    type: params.type,
    discordMessageId: params.messageId,
    discordAttachmentId: attachment.id,
    fileName: attachment.name ?? `${attachment.id}.${ext}`,
    size: body.length,
    mimeType,
    sha256: sha256(body),
    storageKey,
    discordUrl: attachment.url,
  };
}

