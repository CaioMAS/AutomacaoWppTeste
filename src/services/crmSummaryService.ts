// src/services/agendaSummaryService.ts
import { prisma } from "../db/database";
import { StatusAgendamento } from "@prisma/client";

export class AgendaSummaryService {
  /**
   * Gera a mensagem formatada de resumo da turma
   */
  async generateWeeklyAgendaMessage(turmaNome: string): Promise<string> {
    // Busca todos os agendamentos dessa turma
    const turma = await prisma.turma.findFirst({
      where: { nome: turmaNome },
      include: {
        agendamentos: {
          include: { lead: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!turma) throw new Error(`Turma "${turmaNome}" não encontrada.`);

    // Agrupa os agendamentos por status
    const grupos = {
      FECHADO: [] as string[],
      PENSANDO: [] as string[],
      PARADO: [] as string[],
      PERDA: [] as string[],
      NO_SHOW: 0,
    };

    turma.agendamentos.forEach((ag) => {
      const nome = ag.lead?.nome || "Sem nome";

      switch (ag.status) {
        case StatusAgendamento.FECHADO:
          grupos.FECHADO.push(nome);
          break;
        case StatusAgendamento.PENSANDO:
          grupos.PENSANDO.push(nome);
          break;
        case StatusAgendamento.PARADO:
          grupos.PARADO.push(nome);
          break;
        case StatusAgendamento.PERDA:
          grupos.PERDA.push(nome);
          break;
        case StatusAgendamento.NO_SHOW:
          grupos.NO_SHOW++;
          break;
        default:
          break;
      }
    });

    // Monta a mensagem conforme o modelo
    const formatList = (list: string[]) =>
      list.length > 0 ? list.map((n, i) => `✅ ${String(i + 1).padStart(2, "0")} - ${n}`).join("\n") : "—";

    const msg = `
🚀 *CONTRATOS FECHADOS – ${turma.nome.toUpperCase()}*

As empresas que já confirmaram presença no Desafio Empreendedor:

${formatList(grupos.FECHADO)}

CRM

🤔 *Leads que apresentamos e estão PENSANDO:*
${grupos.PENSANDO.map((n) => `🤔 ${n}`).join("\n") || "—"}

🤦🏻‍♂️ *Leads que apresentamos e PARARAM DE RESPONDER:*
${grupos.PARADO.map((n) => `🤦🏻‍♂️ ${n}`).join("\n") || "—"}

🚫 *Leads que já apresentamos e NEGARAM:*
${grupos.PERDA.map((n) => `🚫 ${n}`).join("\n") || "—"}

📉 *Total de NO_SHOW:* ${grupos.NO_SHOW}
`.trim();

    return msg;
  }
}
