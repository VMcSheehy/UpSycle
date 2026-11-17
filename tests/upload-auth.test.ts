import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/seller-auth", () => ({ resolveSellerAuth: vi.fn() }));
vi.mock("@/lib/s3", () => ({ createPresignedUpload: vi.fn() }));

import { POST } from "@/app/api/upload/route";
import { getCurrentUser } from "@/lib/current-user";
import { resolveSellerAuth } from "@/lib/seller-auth";
import { createPresignedUpload } from "@/lib/s3";
import { authorizeUploadRequest } from "@/lib/upload-policy";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const resolveSellerAuthMock = vi.mocked(resolveSellerAuth);
const createPresignedUploadMock = vi.mocked(createPresignedUpload);

function call(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("upload auth guard", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    resolveSellerAuthMock.mockReset();
    createPresignedUploadMock.mockReset();
    createPresignedUploadMock.mockResolvedValue({
      uploadUrl: "https://s3.example/upload",
      fields: { key: "product-photos/user-1/file.jpg" },
      fileUrl: "https://cdn.example/product-photos/user-1/file.jpg",
      key: "product-photos/user-1/file.jpg",
    });
  });

  it("refuses a signed-out caller before creating an upload", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const response = await call({
      fileName: "bowl.jpg",
      contentType: "image/jpeg",
      keyPrefix: "product-photos",
    });
    expect(response.status).toBe(401);
    expect(createPresignedUploadMock).not.toHaveBeenCalled();
  });

  it("refuses product photos from a signed-in user who is not an approved seller", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" } as never);
    resolveSellerAuthMock.mockResolvedValue({
      ok: false,
      failure: { kind: "not-approved", approvalStatus: "PENDING" },
    });
    const response = await call({
      fileName: "bowl.jpg",
      contentType: "image/jpeg",
      keyPrefix: "product-photos",
    });
    expect(response.status).toBe(403);
    expect(createPresignedUploadMock).not.toHaveBeenCalled();
  });

  it("lets an approved seller upload a product photo, scoped to their user id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" } as never);
    resolveSellerAuthMock.mockResolvedValue({
      ok: true,
      seller: { userId: "user-1", email: "seller@example.com", sellerProfileId: "shop-1" },
    });
    const response = await call({
      fileName: "bowl.jpg",
      contentType: "image/jpeg",
      keyPrefix: "product-photos",
    });
    expect(response.status).toBe(200);
    expect(createPresignedUploadMock).toHaveBeenCalledWith("image/jpeg", "jpg", "product-photos", "user-1");
  });

  it("lets a signed-in applicant upload a vetting file without being approved", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "applicant-1" } as never);
    const response = await call({
      fileName: "proof.pdf",
      contentType: "application/pdf",
      keyPrefix: "proof-of-handcrafted",
    });
    expect(response.status).toBe(200);
    expect(resolveSellerAuthMock).not.toHaveBeenCalled();
    expect(createPresignedUploadMock).toHaveBeenCalledWith(
      "application/pdf",
      "pdf",
      "proof-of-handcrafted",
      "applicant-1",
    );
  });

  it("rejects a PDF for the public product-photo bucket", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" } as never);
    resolveSellerAuthMock.mockResolvedValue({
      ok: true,
      seller: { userId: "user-1", email: "seller@example.com", sellerProfileId: "shop-1" },
    });
    const response = await call({
      fileName: "notes.pdf",
      contentType: "application/pdf",
      keyPrefix: "product-photos",
    });
    expect(response.status).toBe(400);
    expect(createPresignedUploadMock).not.toHaveBeenCalled();
  });
});

describe("authorizeUploadRequest", () => {
  it("requires a user, and an approved seller for product photos", () => {
    expect(authorizeUploadRequest({ userId: null, isApprovedSeller: false, keyPrefix: "product-photos" }).ok).toBe(
      false,
    );
    expect(
      authorizeUploadRequest({ userId: "user-1", isApprovedSeller: false, keyPrefix: "product-photos" }),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      authorizeUploadRequest({ userId: "user-1", isApprovedSeller: false, keyPrefix: "seller-sample-photos" }),
    ).toEqual({ ok: true, userId: "user-1" });
  });
});
