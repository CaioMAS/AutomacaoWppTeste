/*
  Warnings:

  - The values [CONFIRMADA,CONCLUIDA,AGUARDANDO,CANCELADA] on the enum `StatusAgendamento` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "StatusAgendamento_new" AS ENUM ('AGENDANDO', 'PENSANDO', 'PARADO', 'PERDA', 'FECHADO', 'NO_SHOW');
ALTER TABLE "public"."Agendamento" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Agendamento" ALTER COLUMN "status" TYPE "StatusAgendamento_new" USING ("status"::text::"StatusAgendamento_new");
ALTER TYPE "StatusAgendamento" RENAME TO "StatusAgendamento_old";
ALTER TYPE "StatusAgendamento_new" RENAME TO "StatusAgendamento";
DROP TYPE "public"."StatusAgendamento_old";
ALTER TABLE "Agendamento" ALTER COLUMN "status" SET DEFAULT 'AGENDANDO';
COMMIT;
