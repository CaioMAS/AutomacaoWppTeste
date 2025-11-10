// src/usecases/generateAndSendSummary.ts
import { prisma } from "../db/database";
import { enviarMensagemInstancia } from "../services/whatasappMensageGeneric";

// 🔹 Variáveis de ambiente fixas
const INSTANCIA_IA = process.env.INSTANCIA_IA;
const NUMERO_FIXO_GRUPO = process.env.NUMERO_FIXO_GRUPO;

/**
 * Gera e envia o resumo de CRM e estatísticas da turma correspondente ao agendamento atualizado.
 */
export async function generateAndSendSummary(agendamentoId: string): Promise<void> {
  try {
    // 1️⃣ Buscar o agendamento com a turma
    const agendamento = await prisma.agendamento.findUnique({
      where: { id: agendamentoId },
      include: {
        turma: true,
      },
    });

    if (!agendamento) {
      console.error(`❌ Agendamento ${agendamentoId} não encontrado ao gerar resumo.`);
      return;
    }

    const turmaNome = agendamento.turma.nome;
    const turmaId = agendamento.turma_id;

    // 2️⃣ Buscar todos os agendamentos dessa turma
    const agendamentosTurma = await prisma.agendamento.findMany({
      where: { turma_id: turmaId },
      include: { lead: true },
    });

    // 3️⃣ Separar os agendamentos por status
    const fechados = agendamentosTurma.filter(a => a.status === "FECHADO");
    const pensando = agendamentosTurma.filter(a => a.status === "PENSANDO");
    const parou = agendamentosTurma.filter(a => a.status === "PARADO");
    const negaram = agendamentosTurma.filter(a => a.status === "PERDA");
    const noShow = agendamentosTurma.filter(a => a.status === "NO_SHOW");
    const totalAgendados = agendamentosTurma.length;

    // 4️⃣ Montar mensagem de CRM
    const formatarLista = (lista: typeof agendamentosTurma) =>
      lista.length
        ? lista.map((a, i) => `✅ ${String(i + 1).padStart(2, "0")} - ${a.lead?.nome || "Sem nome"}`).join("\n")
        : "— Nenhum até o momento.";

    const msgCRM = `🚀 *CONTRATOS FECHADOS – ${turmaNome}*\n\n` +
      `As empresas que já confirmaram presença no Desafio Empreendedor:\n` +
      `${formatarLista(fechados)}\n\n` +
      `🤔 *PENSANDO*\n${pensando.map(l => `🤔 ${l.lead?.nome}`).join("\n") || "— Nenhum"}\n\n` +
      `🤦🏻‍♂️ *PAROU DE RESPONDER*\n${parou.map(l => `🤦🏻‍♂️ ${l.lead?.nome}`).join("\n") || "— Nenhum"}\n\n` +
      `🚫 *NEGARAM*\n${negaram.map(l => `🚫 ${l.lead?.nome}`).join("\n") || "— Nenhum"}`;

    // 5️⃣ Estatísticas
    const taxaFechamento = totalAgendados > 0 ? ((fechados.length / totalAgendados) * 100).toFixed(1) : "0";
    const taxaNoShow = totalAgendados > 0 ? ((noShow.length / totalAgendados) * 100).toFixed(1) : "0";
    const taxaAtivos = totalAgendados > 0 ? (((fechados.length + pensando.length) / totalAgendados) * 100).toFixed(1) : "0";

    const estatisticas = `\n📊 *ESTATÍSTICAS DO FUNIL – ${turmaNome}*\n` +
      `• Total de leads: ${totalAgendados}\n` +
      `• Fechados: ${fechados.length} (${taxaFechamento}%)\n` +
      `• Pensando: ${pensando.length}\n` +
      `• Parou de responder: ${parou.length}\n` +
      `• Negaram: ${negaram.length}\n` +
      `• No Show: ${noShow.length} (${taxaNoShow}%)\n` +
      `• Engajamento total: ${taxaAtivos}%`;

    // 6️⃣ Mensagem final
    const mensagemFinal = `${msgCRM}\n\n${estatisticas}`;

    // 7️⃣ Enviar via WhatsApp
    if (!INSTANCIA_IA || !NUMERO_FIXO_GRUPO) {
      console.error("❌ Variáveis de ambiente faltando: INSTANCIA_IA ou NUMERO_FIXO_GRUPO.");
      return;
    }

    await enviarMensagemInstancia(INSTANCIA_IA, NUMERO_FIXO_GRUPO, mensagemFinal);

    console.log(`✅ Resumo de CRM e estatísticas enviado com sucesso para ${turmaNome}.`);
  } catch (error) {
    console.error("❌ Erro ao gerar e enviar o resumo de CRM:", error);
  }
}
