/*
  Warnings:

  - You are about to drop the column `closer_id` on the `Agendamento` table. All the data in the column will be lost.
  - You are about to drop the `Usuario` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `chefe_nome` to the `Agendamento` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Agendamento" DROP CONSTRAINT "Agendamento_closer_id_fkey";

-- AlterTable
ALTER TABLE "Agendamento" DROP COLUMN "closer_id",
ADD COLUMN     "chefe_nome" TEXT NOT NULL;

-- DropTable
DROP TABLE "public"."Usuario";
