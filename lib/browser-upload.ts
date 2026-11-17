"use client";

// Shared browser upload. The API returns a presigned POST (url + fields);
// the file must be the last form field so S3 applies the signed conditions.
export async function uploadViaPresignedPost(
  file: File,
  keyPrefix: "seller-sample-photos" | "product-photos" | "proof-of-handcrafted",
): Promise<string> {
  const presignRes = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, keyPrefix }),
  });
  const presignData = (await presignRes.json().catch(() => ({}))) as {
    error?: string;
    uploadUrl?: string;
    fields?: Record<string, string>;
    fileUrl?: string;
  };
  if (!presignRes.ok || !presignData.uploadUrl || !presignData.fields || !presignData.fileUrl) {
    throw new Error(presignData.error ?? "Failed to get an upload URL.");
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(presignData.fields)) {
    form.append(key, value);
  }
  form.append("file", file);

  const postRes = await fetch(presignData.uploadUrl, { method: "POST", body: form });
  if (!postRes.ok) {
    throw new Error("Upload to storage failed.");
  }

  return presignData.fileUrl;
}
