import type { AttachmentType } from '@prisma/client';
import type { Attachment } from 'discord.js';
import { getObjectStorage } from '../../infrastructure/object-storage/factory.js';
import { sha256 } from '../../infrastructure/object-storage/filesystem.js';

/** Une piece jointe est consideree image si MIME image/* ou dimensions presentes. */
export function isImageAttachment(att: Attachment): boolean {
  return (att.contentType?.startsWith('image/') ?? false) || att.width != null;
}

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
 * Telecharge une preuve et la copie dans le stockage durable (CDC §5.3).
 * La cle de stockage est indexee par threadId (independante de l'ID de vente,
 * qui n'existe pas encore au moment du telechargement).
 */
export async function downloadAndStore(params: {
  guildId: string;
  threadId: string;
  type: AttachmentType;
  messageId: string;
  attachment: Attachment;
}): Promise<StoredAttachment> {
  const { attachment } = params;
  const res = await fetch(attachment.url);
  if (!res.ok) {
    throw new Error(`Telechargement de la preuve echoue (HTTP ${res.status})`);
  }
  const body = Buffer.from(await res.arrayBuffer());
  const mimeType = attachment.contentType ?? 'application/octet-stream';
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
