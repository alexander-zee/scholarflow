-- CreateTable
CREATE TABLE "FullDraftJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "lastStep" TEXT,
    "failedStep" TEXT,
    "message" TEXT,
    "details" TEXT,
    "errorStack" TEXT,
    "skippedSources" JSONB,
    "requestPayload" JSONB NOT NULL,
    "sourcesTotal" INTEGER,
    "modelPrimary" TEXT,
    "modelFallback" TEXT,
    "referenceChars" INTEGER,
    "resultSections" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FullDraftJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FullDraftJob_projectId_idx" ON "FullDraftJob"("projectId");

-- CreateIndex
CREATE INDEX "FullDraftJob_userId_idx" ON "FullDraftJob"("userId");

-- AddForeignKey
ALTER TABLE "FullDraftJob" ADD CONSTRAINT "FullDraftJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
