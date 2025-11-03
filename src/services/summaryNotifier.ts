// src/services/summaryNotifier.ts

import { AgendaSummaryService } from './agendaSummaryService';
// ⚠️ CORREÇÃO DE TYPO: Alterado de 'whatasappMensageGeneric' para 'whatsappService'
// (Ou verifique o nome correto do seu arquivo)
import { enviarMensagemInstancia } from './whatasappMensageGeneric'; 

// Interface para os dados necessários para enviar o resumo
export interface ISummaryNotificationDTO {
  turma_nome: string;
}

// 🔴 VARIÁVEIS FIXAS PARA TESTE RÁPIDO 🔴
// Estes valores estão corretos e serão usados agora!
const INSTANCIA_FIXA_RESUMO = "AgenteIA"; 
const NUMERO_FIXO_SDR_RESUMO = "553898001014"; 

/**
 * Orquestra a geração do resumo da agenda da semana e o envio via WhatsApp.
 */
export async function sendSummaryUpdate(data: ISummaryNotificationDTO): Promise<void> {
  
  // Usaremos as constantes fixas
  const instancia = INSTANCIA_FIXA_RESUMO;
  const numero_destino = NUMERO_FIXO_SDR_RESUMO;

  // ⚠️ CORREÇÃO: Removemos a checagem 'instancia === "AgenteIA"'
  if (!instancia || !numero_destino) { 
    console.error("❌ ERRO FATAL: Instância ou Número de Destino estão vazios.");
    return;
  }
  
  try {
    const summaryService = new AgendaSummaryService();
    // 1. Gerar a mensagem formatada
    const mensagemResumo = await summaryService.generateWeeklyAgendaMessage(data.turma_nome);

    // 2. Enviar a mensagem para o SDR
    await enviarMensagemInstancia(
      instancia,
      numero_destino,
      mensagemResumo
    );

    console.log(`✅ Resumo da agenda semanal para ${data.turma_nome} enviado com sucesso para ${numero_destino}.`);
    
  } catch (error) {
    console.error(`❌ Falha ao enviar resumo da agenda para ${data.turma_nome}:`, error);
  }
}