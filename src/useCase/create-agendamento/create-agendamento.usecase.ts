// src/useCases/create-agendamento/create-agendamento.usecase.ts

// --- Importações de Serviços ---
import { prisma } from '../../db/database'; // Caminho que você especificou
import {
  createGoogleCalendarEvent,
  getMeetings,
} from '../../services/calendarService'; // Assumindo que getMeetings está aqui
import { confirmarReuniaoWhatsApp } from '../../services/whatsappService'; // Assumindo o caminho
import { calendar_v3 } from 'googleapis';
import { Agendamento } from '@prisma/client'; // Importa o tipo do Prisma

// --- DTO (Interface de entrada) ---
// Este é o JSON que o n8n deve enviar
export interface ICreateAgendamentoDTO {
  clienteNome: string;
  clienteNumero: string;
  dataHora: string;
  chefeNome: string;
  turma_nome: string; // <-- Essencial para o Upsert
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
  created: any; // O tipo 'found' do seu controller antigo
  confirmList: any[]; // O 'meetings' do seu controller antigo
  agendamentoDB: Agendamento; // O registro do prisma
}

export class CreateAgendamentoUseCase {
  async execute(data: ICreateAgendamentoDTO): Promise<IUseCaseResult> {
    
    console.log('🚀 [UseCase V3] Iniciando create-agendamento (com Upsert)...');
    console.log('Dados recebidos:', JSON.stringify(data, null, 2));

    // --- 1. Validação de Entrada (Lógica do controller antigo) ---
    if (
      !data.clienteNome ||
      !data.clienteNumero ||
      !data.dataHora ||
      !data.chefeNome ||
      !data.turma_nome // <-- Validando o novo campo
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

    // --- 2. Lógica do PRISMA (BUSCAR OU CRIAR) ---
    console.log(`Buscando ou Criando turma: ${data.turma_nome}...`);
    const turma = await prisma.turma.upsert({
      where: { nome: data.turma_nome }, // O campo que usamos para buscar
      create: { nome: data.turma_nome }, // O que fazer se não achar (Criar)
      update: {}, // O que fazer se achar (Nada)
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

    // --- 4. Chamar GOOGLE CALENDAR (Lógica do controller antigo) ---
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
        chefe_nome: data.chefeNome, // Salvando o nome como texto
        
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

    // --- 6. Enviar WhatsApp (Lógica do controller antigo) ---
    console.log(`Enviando WhatsApp para: ${data.clienteNumero}...`);
    try {
      await confirmarReuniaoWhatsApp({
        clienteNome: data.clienteNome,
        clienteNumero: data.clienteNumero,
        chefeNome: data.chefeNome,
        dataHoraISO: data.dataHora,
        cidadeOpcional: data.cidadeOpcional,
      });
      console.log('✅ WhatsApp enviado.');
    } catch (waErr) {
      console.warn(
        '⚠️ Falha ao enviar WhatsApp (não impede confirmação do evento):',
        waErr,
      );
    }

    // --- 7. READ-AFTER-WRITE (Lógica do controller antigo) ---
    console.log('Confirmando evento no Google (read-after-write)...');
    const dayStr = data.dataHora.slice(0, 10); // "YYYY-MM-DD"
    const meetings = await getMeetings({ day: dayStr });
    const expectedStartISO = new Date(data.dataHora).toISOString();

    const found = meetings.find(
      (m: any) => // Adicionado 'any' para flexibilidade nos tipos de 'm'
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

    // --- 8. Sucesso ---
    console.log('🎉 [UseCase V3] Executado com sucesso!');
    return {
      created: found,
      confirmList: meetings,
      agendamentoDB: agendamentoDB,
    };
  }
}