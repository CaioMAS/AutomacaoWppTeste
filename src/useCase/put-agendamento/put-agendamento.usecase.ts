import { prisma } from "../../db/database";
import { StatusAgendamento } from "@prisma/client";
import { generateAndSendSummary } from "../../services/generateAndSendSummary";


export async function updateAgendamentoStatus(id: string, status: string) {
  const STATUS_VALIDOS = Object.values(StatusAgendamento);

  if (!STATUS_VALIDOS.includes(status as StatusAgendamento)) {
    throw new Error(`Status inválido. Os status permitidos são: ${STATUS_VALIDOS.join(", ")}.`);
  }

  const agendamentoExistente = await prisma.agendamento.findUnique({ where: { id } });
  if (!agendamentoExistente) throw new Error(`Agendamento com ID ${id} não encontrado.`);

  const agendamentoAtualizado = await prisma.agendamento.update({
    where: { id },
    data: { status: status as StatusAgendamento },
  });

  // ✅ NOVO: após atualizar, gera e envia o resumo da turma
  await generateAndSendSummary({ agendamentoId: agendamentoAtualizado.id });

  return agendamentoAtualizado;
}
