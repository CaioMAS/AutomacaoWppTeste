// src/config/agendaSlots.ts

// Define os slots de horários válidos para cada dia da semana.
// A chave deve ser o nome do dia em MAIÚSCULO e PT-BR.
export const agendaSlots: Record<string, string[]> = {
    'SEGUNDA-FEIRA': [
        '09:30', '11:00', '13:00', '15:00', '17:00', '19:00'
    ],
    'TERÇA-FEIRA': [
        '08:00', '10:00', '13:00', '15:00', '17:00', '19:00'
    ],
    'QUARTA-FEIRA': [
        '08:00', '10:00', '13:00', '15:00', '17:00', '19:00'
    ],
    'QUINTA-FEIRA': [
        '09:00', '11:00', '14:00', '15:00', '17:00', '19:00'
    ],
    'SEXTA-FEIRA': [
        '08:00', '10:00', '13:00', '15:00', '17:00', '19:00'
    ],
    'SÁBADO': [
        '09:00', '11:00', '13:00'
    ],
};

// Mapeia o índice do dia (Date.getDay()) para o nome PT-BR (1=Segunda)
export const diasDaSemana = [
    'DOMINGO',
    'SEGUNDA-FEIRA',
    'TERÇA-FEIRA',
    'QUARTA-FEIRA',
    'QUINTA-FEIRA',
    'SEXTA-FEIRA',
    'SÁBADO',
];