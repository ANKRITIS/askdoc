import { createUploadthing, type FileRouter } from "uploadthing/next";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";

const f = createUploadthing();

export const ourFileRouter = {
  freePlanUploader: f({ pdf: { maxFileSize: "4MB" } })
    .middleware(async () => {
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");
      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("--- UPLOAD COMPLETE ---");

      const createdFile = await db.file.create({
        data: {
          key: file.key,
          name: file.name,
          userId: metadata.userId,
          url: file.ufsUrl,
          uploadStatus: "PROCESSING",
        },
      });

      console.log("--- SAVED TO DB:", createdFile.id, "---");

      // Fire and forget - don't await
      fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/process-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: createdFile.id, fileUrl: file.ufsUrl }),
      }).catch(console.error);
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;