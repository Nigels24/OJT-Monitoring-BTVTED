-- AlterTable
ALTER TABLE "User" ADD COLUMN     "credentialsEmailError" TEXT,
ADD COLUMN     "credentialsEmailStatus" TEXT,
ADD COLUMN     "credentialsSentAt" TIMESTAMP(3);

