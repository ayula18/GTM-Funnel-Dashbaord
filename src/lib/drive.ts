import { google, type drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { errorMessage } from './utils';

// ── Google Drive upload (service account) ────────────────────────────────────
//
// Setup (one time):
//   1. Create a Google Cloud service account, enable the Drive API, download its
//      JSON key.
//   2. Create a Drive folder, share it with the service account's email (Editor).
//   3. Set env (either form of the key works):
//        GOOGLE_SERVICE_ACCOUNT_B64  = base64 of the whole JSON key file (recommended)
//        GOOGLE_SERVICE_ACCOUNT_JSON = the full JSON on one line (single-quoted)
//        GDRIVE_FOLDER_ID            = the folder's id (from its URL)
//
// Scope is the FULL `drive` scope, not `drive.file`: the narrower scope only
// sees files the service account itself created, so it can't write into a
// user-owned folder that was merely shared with it.

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

/** The raw service-account JSON, from the base64 var (preferred) or the raw var. */
function serviceAccountJson(): string | null {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (b64) return Buffer.from(b64, 'base64').toString('utf8');
  return process.env.GOOGLE_SERVICE_ACCOUNT_JSON || null;
}

export function driveConfigured(folderEnvVar: string = 'GDRIVE_FOLDER_ID'): boolean {
  return !!(serviceAccountJson() && process.env[folderEnvVar]);
}

/** Build an authed Drive client + the target folder id, or throw a clear error. */
function getDrive(folderEnvVar: string = 'GDRIVE_FOLDER_ID'): { drive: drive_v3.Drive; folderId: string } {
  const raw = serviceAccountJson();
  const folderId = process.env[folderEnvVar];
  if (!raw || !folderId) {
    throw new Error(`Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_B64 (or _JSON) and ${folderEnvVar}.`);
  }
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('Service account credentials are not valid JSON.');
  }
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [DRIVE_SCOPE] });
  return { drive: google.drive({ version: 'v3', auth }), folderId };
}

export async function uploadXlsxToDrive(
  fileName: string,
  buffer: Buffer,
  folderEnvVar: string = 'GDRIVE_FOLDER_ID'
): Promise<{ id: string; link: string }> {
  const { drive, folderId } = getDrive(folderEnvVar);
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: XLSX_MIME, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  return { id: res.data.id || '', link: res.data.webViewLink || '' };
}

export async function upsertXlsxToDrive(
  fileName: string,
  buffer: Buffer,
  folderEnvVar: string = 'GDRIVE_FOLDER_ID'
): Promise<{ id: string; link: string; updated: boolean }> {
  const { drive, folderId } = getDrive(folderEnvVar);
  
  // Search for an existing file with the exact same name in this folder
  const query = `name = '${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`;
  const searchRes = await drive.files.list({
    q: query,
    fields: 'files(id, webViewLink)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  
  const existingFile = searchRes.data.files && searchRes.data.files.length > 0 ? searchRes.data.files[0] : null;

  if (existingFile && existingFile.id) {
    // Update existing file
    await drive.files.update({
      fileId: existingFile.id,
      media: { mimeType: XLSX_MIME, body: Readable.from(buffer) },
      supportsAllDrives: true,
    });
    return { id: existingFile.id, link: existingFile.webViewLink || '', updated: true };
  } else {
    // Create new file
    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType: XLSX_MIME, body: Readable.from(buffer) },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });
    return { id: res.data.id || '', link: res.data.webViewLink || '', updated: false };
  }
}

/** Status for the UI indicator: is Drive wired up AND can we reach the folder? */
export async function verifyDriveAccess(folderEnvVar: string = 'GDRIVE_FOLDER_ID'): Promise<{
  configured: boolean;
  ok: boolean;
  folderName?: string;
  error?: string;
}> {
  if (!driveConfigured(folderEnvVar)) return { configured: false, ok: false };
  try {
    const { drive, folderId } = getDrive(folderEnvVar);
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'id, name',
      supportsAllDrives: true,
    });
    return { configured: true, ok: true, folderName: res.data.name || undefined };
  } catch (e) {
    return { configured: true, ok: false, error: errorMessage(e) };
  }
}
