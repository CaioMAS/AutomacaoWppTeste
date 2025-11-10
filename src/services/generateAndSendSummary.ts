// src/usecases/generateAndSendSummary.ts
import { prisma } from "../db/database";
import { StatusAgendamento } from "@prisma/client";
import { enviarMensagemInstancia } from "../services/whatasappMensageGeneric"; // ajuste o path se necessário

interface IGenerateSummaryParams {
  agendamentoId: string;
}

/**
 * Gera o resumo CRM para a turma do agendamento e envia para o grupo fixo via WhatsApp.
 */
export async function generateAndSendSummary({ agendamentoId }: IGenerateSummaryParams): Promise<void> {
  try {
    // 1) Busca agendamento e turma
    const agendamento = await prisma.agendamento.findUnique({
      where: { id: agendamentoId },
      include: {
        turma: true,
      },
    });

    if (!agendamento) {
      console.error(`❌ Agendamento ${agendamentoId} não encontrado.`);
      return;
    }

    const turmaId = agendamento.turma_id;
    const turmaNome = agendamento.turma?.nome || "TURMA";

    // 2) Busca todos os agendamentos da turma com dados do lead
    const agendamentos = await prisma.agendamento.findMany({
      where: { turma_id: turmaId },
      include: { lead: true },
      orderBy: { data_hora: "asc" },
    });

    // 3) Agrupa por status
    const fechados: string[] = [];
    const pensando: string[] = [];
    const parouDeResponder: string[] = [];
    const perdas: string[] = [];
    let noShowCount = 0;

    agendamentos.forEach((a) => {
      const nomeLead = a.lead?.nome?.trim() || "Sem nome";
      switch (a.status) {
        case StatusAgendamento.FECHADO:
          fechados.push(nomeLead);
          break;
        case StatusAgendamento.PENSANDO:
          pensando.push(nomeLead);
          break;
        case StatusAgendamento.PARADO:
          parouDeResponder.push(nomeLead);
          break;
        case StatusAgendamento.PERDA:
          perdas.push(nomeLead);
          break;
        case StatusAgendamento.NO_SHOW:
          noShowCount += 1;
          break;
        default:
          // AGENDANDO ou outros -> ignorar para o resumo
          break;
      }
    });

    // 4) Formata as seções conforme modelo (numeração com 2 dígitos para FECHADOS)
    const formatFechados = (list: string[]) => {
      if (list.length === 0) return "—";
      return list
        .map((n, i) => `✅ ${String(i + 1).padStart(2, "0")} - ${n}`)
        .join("\n");
    };

    const formatSimpleList = (list: string[], emoji: string) => {
      if (list.length === 0) return "—";
      return list.map((n) => `${emoji} ${n}`).join("\n");
    };

    const mensagem = [
      `🚀 CONTRATOS FECHADOS – ${turmaNome.toUpperCase()}`,
      ``,
      `As empresas que já confirmaram presença no Desafio Empreendedor:`,
      ``,
      formatFechados(fechados),
      ``,
      `CRM`,
      ``,
      `🤔 Leads que apresentamos e está PENSANDO`,
      ``,
      formatSimpleList(pensando, "🤔"),
      ``, // quebra
      `🤦🏻‍♂️ Leads que apresentamos e PAROU DE RESPONDER`,
      ``,
      formatSimpleList(parouDeResponder, "🤦🏻‍♂️"),
      ``,
      `🚫 Leads que já apresentamos e NEGARAM`,
      ``,
      formatSimpleList(perdas, "🚫"),
      ``,
      `📉 Total de NO_SHOW: ${noShowCount}`,
    ].join("\n");

    // 5) Envia a mensagem para o grupo fixo via enviarMensagemInstancia
    const instancia = process.env.INSTANCIA_IA;
    const numeroDestino = process.env.NUMERO_FIXO_GRUPO;

    if (!instancia || !numeroDestino) {
      console.error("❌ ENV VARS não configuradas: INSTANCIA_IA e/ou NUMERO_FIXO_GRUPO.");
      console.log("Mensagem gerada (sem envio):\n", mensagem);
      return;
    }

    await enviarMensagemInstancia(instancia, numeroDestino, mensagem);

    console.log(`✅ Resumo CRM da turma "${turmaNome}" enviado para ${numeroDestino}.`);
  } catch (error) {
    console.error(`❌ Erro ao gerar/enviar resumo para agendamento ${agendamentoId}:`, error);
  }
}