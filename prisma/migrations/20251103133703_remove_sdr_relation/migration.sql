/*
  Warnings:

  - You are about to drop the column `sdr_id` on the `Agendamento` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Agendamento" DROP CONSTRAINT "Agendamento_sdr_id_fkey";

-- AlterTable
ALTER TABLE "Agendamento" DROP COLUMN "sdr_id";
