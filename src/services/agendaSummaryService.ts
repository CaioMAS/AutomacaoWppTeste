// src/services/agendaSummaryService.ts

// OBS: Certifique-se de que 'date-fns' está instalado
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
} from 'date-fns';
import { prisma } from '../db/database'; 
import { Agendamento, Lead } from '@prisma/client';
import { agendaSlots, diasDaSemana } from '../config/agendaSlots'; // Fonte dos slots fixos


/**
 * Interface para representar um item na lista final do dia (agendado ou livre)
 */
interface SlotItem {
    time: string;
    isBooked: boolean;
    name?: string;
    chefe?: string;
}

/**
 * Busca agendamentos da semana para uma turma e gera o resumo dinâmico.
 */
export class AgendaSummaryService {
  
  private today: Date;
  private inicioSemana: Date;
  private fimSemana: Date;
  private agendamentosDaSemana: (Agendamento & { lead: Lead })[] = [];
  
  constructor() {
    this.today = new Date();
    // Início da semana: Segunda-feira (weekStartsOn: 1)
    this.inicioSemana = startOfWeek(this.today, { weekStartsOn: 1 });
    
    // Fim da semana: Sábado. Adicionamos 5 dias
    this.fimSemana = addDays(this.inicioSemana, 5);
    // Set hours para o final do dia de sábado, garantindo a busca
    this.fimSemana.setHours(23, 59, 59, 999);
  }

  // Helper para comparar horários no formato 'HH:MM'
  private parseTimeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Ponto de entrada principal. Gera a mensagem formatada combinando agendamentos reais e slots livres.
   */
  public async generateWeeklyAgendaMessage(turmaNome: string): Promise<string> {
    console.log(`[AgendaSummaryService] Gerando resumo dinâmico para ${turmaNome}`);
    
    await this.fetchAgendamentos(turmaNome);

    // 1. Construir o Cabeçalho
    let message = `📅 Agenda Presencial - ${turmaNome}\n`;
    message += `(De ${format(this.inicioSemana, 'dd/MM')} à ${format(this.fimSemana, 'dd/MM')})\n`;

    // 2. Loop de 0 (Seg) a 5 (Sab)
    for (let i = 0; i < 6; i++) {
      const diaAtual = addDays(this.inicioSemana, i);
      const nomeDia = diasDaSemana[diaAtual.getDay()].toUpperCase();
      
      const slotsFixosDoDia = agendaSlots[nomeDia]; // Slots padrão (ex: 09:30, 11:00)
      
      if (slotsFixosDoDia) {
        message += `\n${nomeDia} – ${format(diaAtual, 'dd/MM')}\n\n`;
        
        // A) Encontra agendamentos reais (inclui os horários customizados, como 07:00h)
        const agendamentosNoDia = this.agendamentosDaSemana.filter(ag => isSameDay(ag.data_hora, diaAtual));
        
        // B) Usa um Map para combinar slots fixos (livres) e agendamentos reais (ocupados)
        const allSlotsMap = new Map<string, SlotItem>();
        
        // B1. Adiciona todos os slots fixos (Inicialmente como Livres)
        slotsFixosDoDia.forEach(slot => {
            allSlotsMap.set(slot, { time: slot, isBooked: false });
        });
        
        // B2. Adiciona/Sobrescreve com agendamentos reais (incluindo horários customizados)
        agendamentosNoDia.forEach(ag => {
            // Formata a hora exata do agendamento (ex: "07:00", "09:30")
            const timeStr = format(ag.data_hora, 'HH:mm');
            allSlotsMap.set(timeStr, {
                time: timeStr,
                isBooked: true,
                name: ag.lead.nome,
                chefe: ag.chefe_nome,
            });
        });
        
        // C) Converte o Map para um Array e Ordena pelo tempo
        const finalSlotsArray = Array.from(allSlotsMap.values()).sort((a, b) => 
             this.parseTimeToMinutes(a.time) - this.parseTimeToMinutes(b.time)
        );

        // D) Formata a mensagem final
        for (const item of finalSlotsArray) {
            if (item.isBooked) {
                // Se estiver agendado, mostra o nome (e o chefe)
                message += `🗓 ${item.time} – ${item.name} (${item.chefe})\n`;
            } else {
                // Se estiver livre, mostra o traço
                message += `🗓 ${item.time} –\n`;
            }
        }
      }
    }
    
    return message.trim();
  }

  /**
   * Busca no banco de dados todos os agendamentos da semana para a turma.
   */
  private async fetchAgendamentos(turmaNome: string): Promise<void> {
    this.agendamentosDaSemana = await prisma.agendamento.findMany({
      where: {
        turma: { nome: turmaNome },
        data_hora: {
          gte: this.inicioSemana,
          lte: this.fimSemana,
        },
      },
      include: {
        lead: true, // Inclui o Lead para pegar o nome
      },
      orderBy: {
        data_hora: 'asc',
      },
    });
    console.log(`[AgendaSummaryService] Encontrados ${this.agendamentosDaSemana.length} agendamentos na semana.`);
  }

  // O método findAgendamentoInSlot da versão antiga não é mais usado
}