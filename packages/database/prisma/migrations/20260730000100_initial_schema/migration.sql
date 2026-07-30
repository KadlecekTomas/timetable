-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SchoolYearStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TeachingGroup" AS ENUM ('WHOLE', 'GROUP_1', 'GROUP_2');

-- CreateEnum
CREATE TYPE "LessonShape" AS ENUM ('SINGLE', 'DOUBLE', 'MIXED');

-- CreateEnum
CREATE TYPE "AvailabilityEntityType" AS ENUM ('TEACHER', 'CLASS', 'ROOM');

-- CreateEnum
CREATE TYPE "AvailabilityKind" AS ENUM ('UNAVAILABLE', 'PREFERRED', 'DISCOURAGED');

-- CreateEnum
CREATE TYPE "DistributionRuleType" AS ENUM ('MAX_PER_DAY', 'MIN_DAY_GAP', 'SAME_DAY_FORBIDDEN', 'CONSECUTIVE_REQUIRED');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('QUEUED', 'RUNNING', 'FEASIBLE', 'OPTIMAL', 'INFEASIBLE', 'TIME_LIMIT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TimetableSource" AS ENUM ('GENERATED', 'MANUAL_COPY', 'IMPORTED');

-- CreateEnum
CREATE TYPE "LessonOrigin" AS ENUM ('SOLVER', 'MANUAL', 'FIXED_RULE');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('ANALYZED', 'VALIDATION_FAILED', 'READY', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportSeverity" AS ENUM ('ERROR', 'WARNING');

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Prague',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolYear" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "status" "SchoolYearStatus" NOT NULL DEFAULT 'DRAFT',
    "periodsPerDay" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "targetWeeklyLoad" INTEGER NOT NULL,
    "minWeeklyLoad" INTEGER,
    "maxWeeklyLoad" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomType" (
    "id" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultRoomTypeId" TEXT,
    "colorToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "roomTypeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeachingAssignment" (
    "id" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "assignmentCode" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "group" "TeachingGroup" NOT NULL DEFAULT 'WHOLE',
    "weeklyPeriods" INTEGER NOT NULL,
    "lessonShape" "LessonShape" NOT NULL DEFAULT 'SINGLE',
    "doublePeriodsCount" INTEGER NOT NULL DEFAULT 0,
    "requiredRoomId" TEXT,
    "requiredRoomTypeId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeachingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityRule" (
    "id" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "entityType" "AvailabilityEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "kind" "AvailabilityKind" NOT NULL,
    "weight" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedLessonRule" (
    "id" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "blockIndex" INTEGER NOT NULL DEFAULT 0,
    "dayOfWeek" INTEGER NOT NULL,
    "startPeriod" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "roomId" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedLessonRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionRule" (
    "id" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "type" "DistributionRuleType" NOT NULL,
    "value" INTEGER NOT NULL,
    "hard" BOOLEAN NOT NULL DEFAULT false,
    "weight" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolverProfile" (
    "id" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scoringVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "weightsJson" JSONB NOT NULL,
    "timeLimitSeconds" INTEGER NOT NULL DEFAULT 180,
    "randomSeed" INTEGER NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolverProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationRun" (
    "id" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "solverProfileId" TEXT,
    "inputSnapshotHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "objectiveValue" DOUBLE PRECISION,
    "qualityScore" INTEGER,
    "solverStats" JSONB,
    "explanation" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableVersion" (
    "id" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "generationRunId" TEXT,
    "name" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "source" "TimetableSource" NOT NULL DEFAULT 'GENERATED',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "qualityScore" INTEGER,
    "scoringVersion" TEXT,
    "scoreBreakdown" JSONB,
    "incidentReport" JSONB,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableLesson" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "roomId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startPeriod" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 1,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "origin" "LessonOrigin" NOT NULL DEFAULT 'SOLVER',
    "manuallyChanged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'ANALYZED',
    "expectedSchoolYearVersion" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportIssue" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "severity" "ImportSeverity" NOT NULL,
    "sheet" TEXT NOT NULL,
    "row" INTEGER,
    "column" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "rawValue" TEXT,
    "suggestion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemHealth" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemHealth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "School_name_key" ON "School"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolYear_schoolId_label_key" ON "SchoolYear"("schoolId", "label");

-- CreateIndex
CREATE INDEX "Teacher_schoolYearId_lastName_firstName_idx" ON "Teacher"("schoolYearId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_schoolYearId_code_key" ON "Teacher"("schoolYearId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_schoolYearId_code_key" ON "SchoolClass"("schoolYearId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RoomType_schoolYearId_code_key" ON "RoomType"("schoolYearId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_schoolYearId_code_key" ON "Subject"("schoolYearId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Room_schoolYearId_code_key" ON "Room"("schoolYearId", "code");

-- CreateIndex
CREATE INDEX "TeachingAssignment_schoolYearId_classId_idx" ON "TeachingAssignment"("schoolYearId", "classId");

-- CreateIndex
CREATE INDEX "TeachingAssignment_schoolYearId_teacherId_idx" ON "TeachingAssignment"("schoolYearId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "TeachingAssignment_schoolYearId_assignmentCode_key" ON "TeachingAssignment"("schoolYearId", "assignmentCode");

-- CreateIndex
CREATE INDEX "AvailabilityRule_schoolYearId_entityType_entityId_idx" ON "AvailabilityRule"("schoolYearId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityRule_schoolYearId_entityType_entityId_dayOfWeek_key" ON "AvailabilityRule"("schoolYearId", "entityType", "entityId", "dayOfWeek", "period", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "FixedLessonRule_teachingAssignmentId_blockIndex_key" ON "FixedLessonRule"("teachingAssignmentId", "blockIndex");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionRule_teachingAssignmentId_type_key" ON "DistributionRule"("teachingAssignmentId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SolverProfile_schoolYearId_name_key" ON "SolverProfile"("schoolYearId", "name");

-- CreateIndex
CREATE INDEX "GenerationRun_schoolYearId_createdAt_idx" ON "GenerationRun"("schoolYearId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableVersion_generationRunId_key" ON "TimetableVersion"("generationRunId");

-- CreateIndex
CREATE INDEX "TimetableVersion_schoolYearId_isCurrent_idx" ON "TimetableVersion"("schoolYearId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableVersion_schoolYearId_versionNumber_key" ON "TimetableVersion"("schoolYearId", "versionNumber");

-- CreateIndex
CREATE INDEX "TimetableLesson_versionId_dayOfWeek_startPeriod_idx" ON "TimetableLesson"("versionId", "dayOfWeek", "startPeriod");

-- CreateIndex
CREATE INDEX "TimetableLesson_versionId_teachingAssignmentId_idx" ON "TimetableLesson"("versionId", "teachingAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableLesson_versionId_blockId_key" ON "TimetableLesson"("versionId", "blockId");

-- CreateIndex
CREATE INDEX "ImportBatch_schoolYearId_createdAt_idx" ON "ImportBatch"("schoolYearId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_schoolYearId_fileHash_idx" ON "ImportBatch"("schoolYearId", "fileHash");

-- CreateIndex
CREATE INDEX "ImportIssue_importBatchId_severity_idx" ON "ImportIssue"("importBatchId", "severity");

-- CreateIndex
CREATE INDEX "AuditEvent_schoolYearId_createdAt_idx" ON "AuditEvent"("schoolYearId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemHealth_service_key" ON "SystemHealth"("service");

-- AddForeignKey
ALTER TABLE "SchoolYear" ADD CONSTRAINT "SchoolYear_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_defaultRoomTypeId_fkey" FOREIGN KEY ("defaultRoomTypeId") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_requiredRoomId_fkey" FOREIGN KEY ("requiredRoomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_requiredRoomTypeId_fkey" FOREIGN KEY ("requiredRoomTypeId") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedLessonRule" ADD CONSTRAINT "FixedLessonRule_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionRule" ADD CONSTRAINT "DistributionRule_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolverProfile" ADD CONSTRAINT "SolverProfile_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_solverProfileId_fkey" FOREIGN KEY ("solverProfileId") REFERENCES "SolverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableVersion" ADD CONSTRAINT "TimetableVersion_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableVersion" ADD CONSTRAINT "TimetableVersion_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableLesson" ADD CONSTRAINT "TimetableLesson_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TimetableVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableLesson" ADD CONSTRAINT "TimetableLesson_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableLesson" ADD CONSTRAINT "TimetableLesson_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

