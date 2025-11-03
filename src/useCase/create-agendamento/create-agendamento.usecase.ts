// src/useCases/create-agendamento/create-agendamento.usecase.ts

// --- Importações de Serviços ---
import { prisma } from '../../db/database'; 
import {
  createGoogleCalendarEvent,
  getMeetings,
} from '../../services/calendarService'; 
import { confirmarReuniaoWhatsApp } from '../../services/whatsappService'; 
// A função de notificação, que contém as variáveis fixas de destino
import { sendSummaryUpdate } from '../../services/summaryNotifier'; 
import { calendar_v3 } from 'googleapis';
import { Agendamento } from '@prisma/client';

// --- DTO (Interface de entrada) ---
// INSTANCIA e NUMERO_DESTINO foram REMOVIDOS daqui.
export interface ICreateAgendamentoDTO {
  clienteNome: string;
  clienteNumero: string;
  dataHora: string;
  chefeNome: string;
  turma_nome: string; 
  cidadeOpcional?: string;
  empresaNome?: string;
  endereco?: string;
  referidoPor?: string;
  funcionarios?: number;
  faturamento?: string;
  instagram?: string;
  observacoes?: string;
}

// --- Interface de Saída (O que o controller vai retornar) ---
interface IUseCaseResult {
  created: any; 
  confirmList: any[];
  agendamentoDB: Agendamento;
}

export class CreateAgendamentoUseCase {
  async execute(data: ICreateAgendamentoDTO): Promise<IUseCaseResult> {
    
    console.log('🚀 [UseCase V3] Iniciando create-agendamento (com Upsert + Notificação Interna)...');

    // --- 1. Validação de Entrada ---
    // A validação para 'instancia' e 'numero_destino' foi removida
    if (
      !data.clienteNome ||
      !data.clienteNumero ||
      !data.dataHora ||
      !data.chefeNome ||
      !data.turma_nome
    ) {
      throw new Error(
        'Campos obrigatórios: clienteNome, clienteNumero, dataHora, chefeNome, turma_nome.',
      );
    }

    const dataDate = new Date(data.dataHora);
    if (isNaN(dataDate.getTime())) {
      throw new Error('dataHora inválida.');
    }
    console.log('Data validada:', dataDate.toISOString());

    // --- 2. Lógica do PRISMA (BUSCAR OU CRIAR Turma) ---
    console.log(`Buscando ou Criando turma: ${data.turma_nome}...`);
    const turma = await prisma.turma.upsert({
      where: { nome: data.turma_nome }, 
      create: { nome: data.turma_nome }, 
      update: {}, 
    });
    console.log(`✅ Turma pronta (encontrada ou criada): ${turma.id}`);
    
    // --- 3. Lógica do PRISMA (Criar Lead) ---
    console.log(`Criando lead: ${data.clienteNome}...`);
    const novoLead = await prisma.lead.create({
      data: {
        nome: data.clienteNome,
        telefone: data.clienteNumero,
        instagram: data.instagram,
      },
    });
    console.log(`✅ Lead criado: ${novoLead.id}`);

    // --- 4. Chamar GOOGLE CALENDAR ---
    console.log('Criando evento no Google Calendar...');
    const googleEvent = await createGoogleCalendarEvent(
      data.clienteNome,
      data.clienteNumero,
      data.dataHora,
      data.chefeNome,
      data.cidadeOpcional,
      data.empresaNome,
      data.endereco,
      data.referidoPor,
      data.funcionarios,
      data.faturamento,
      data.observacoes,
      data.instagram,
    );

    if (!googleEvent || !googleEvent.id) {
      throw new Error(
        'Falha ao criar evento no Google Calendar, o ID não foi retornado.',
      );
    }
    console.log(`✅ Evento do Google criado: ${googleEvent.id}`);

    // --- 5. Lógica do PRISMA (Criar Agendamento) ---
    console.log('Salvando agendamento no banco de dados...');
    const agendamentoDB = await prisma.agendamento.create({
      data: {
        data_hora: dataDate,
        status: 'AGENDANDO',
        google_calendar_event_id: googleEvent.id,
        lead_id: novoLead.id,
        turma_id: turma.id,
        chefe_nome: data.chefeNome, 
        
        // Seus campos personalizados
        empresa_nome: data.empresaNome,
        cidade: data.cidadeOpcional,
        endereco: data.endereco,
        referido_por: data.referidoPor,
        funcionarios: data.funcionarios,
        faturamento: data.faturamento,
        observacoes: data.observacoes,
      },
    });
    console.log(`✅ Agendamento salvo no DB! ID: ${agendamentoDB.id}`);

    // --- 6. Enviar WhatsApp (para o CLIENTE) ---
    console.log(`Enviando WhatsApp para o cliente: ${data.clienteNumero}...`);
    try {
      await confirmarReuniaoWhatsApp({
        clienteNome: data.clienteNome,
        clienteNumero: data.clienteNumero,
        chefeNome: data.chefeNome,
        dataHoraISO: data.dataHora,
        cidadeOpcional: data.cidadeOpcional,
      });
      console.log('✅ WhatsApp de confirmação para o Cliente enviado.');
    } catch (waErr) {
      console.warn(
        '⚠️ Falha ao enviar WhatsApp para o cliente (fluxo continua):',
        waErr,
      );
    }

    // --- 7. READ-AFTER-WRITE ---
    console.log('Confirmando evento no Google (read-after-write)...');
    const dayStr = data.dataHora.slice(0, 10); 
    const meetings = await getMeetings({ day: dayStr });
    const expectedStartISO = new Date(data.dataHora).toISOString();

    const found = meetings.find(
      (m: any) => 
        m.start === expectedStartISO ||
        (m.clienteNumero &&
          data.clienteNumero &&
          m.clienteNumero.includes(data.clienteNumero.replace(/\D/g, ''))) ||
        (m.clienteNome &&
          data.clienteNome &&
          m.clienteNome.toLowerCase() === data.clienteNome.toLowerCase()),
    );

    if (!found) {
      console.error(
        '⚠️ Evento não encontrado após criação. Day:',
        dayStr,
        'expectedStart:',
        expectedStartISO,
        'meetingsCount:',
        meetings.length,
      );
      throw new Error(
        'Evento criado, mas não foi possível confirmar sua presença no calendário.',
      );
    }
    console.log(`✅ Evento confirmado no Google: ${found.id}`);

    // --------------------------------------------------------------------------------
    // 8. 🎯 DISPARAR O RESUMO DA AGENDA PARA O SDR
    // --------------------------------------------------------------------------------
    await sendSummaryUpdate({
      turma_nome: data.turma_nome,
      // Instância e Número de Destino serão obtidos de forma fixa dentro de sendSummaryUpdate
    });
    // --------------------------------------------------------------------------------

    // --- 9. Sucesso ---
    console.log('🎉 [UseCase V3] Executado com sucesso!');
    return {
      created: found,
      confirmList: meetings,
      agendamentoDB: agendamentoDB,
    };
  }
}