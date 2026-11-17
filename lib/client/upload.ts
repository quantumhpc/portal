/**
 * Browser-side resumable upload of one file to the portal (tus).
 * Resolves with the server path where the file landed.
 */

import Uppy from "@uppy/core";
import Tus from "@uppy/tus";

export const TUS_ENDPOINT = "/api/data/tus";

export const tusOptions = {
  endpoint: TUS_ENDPOINT,
  chunkSize: 50 * 1024 * 1024,
  retryDelays: [0, 1000, 3000, 5000, 10000],
  removeFingerprintOnSuccess: true,
};

/** Upload `file` (to `destination`, or a fresh folder in the user's upload area). */
export async function uploadFile(
  file: File,
  onProgress?: (percent: number) => void,
  destination?: string
): Promise<string> {
  let target: string | undefined;
  const uppy = new Uppy({ autoProceed: false }).use(Tus, {
    ...tusOptions,
    // A missing field would be sent as the string "undefined", so only list destination when set.
    allowedMetaFields: destination ? ["name", "type", "destination"] : ["name", "type"],
    onAfterResponse: (_req, res) => {
      target = res.getHeader("Upload-Target") ?? target;
    },
  });
  uppy.on("upload-progress", (_f, p) => {
    if (p.bytesTotal) onProgress?.(Math.round((100 * p.bytesUploaded) / p.bytesTotal));
  });

  try {
    uppy.addFile({ name: file.name, type: file.type, data: file, meta: destination ? { destination } : {} });
    const result = await uppy.upload();
    const failed = result?.failed?.[0];
    if (failed) throw new Error(failed.error ?? "Upload failed");
    if (!target) throw new Error("Upload finished but the server did not say where the file is");
    return target;
  } finally {
    uppy.destroy();
  }
}
