-- CreateTable
CREATE TABLE "ReferencePaper" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "extractedText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferencePaper_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferencePaper_projectId_idx" ON "ReferencePaper"("projectId");

-- AddForeignKey
ALTER TABLE "ReferencePaper" ADD CONSTRAINT "ReferencePaper_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
