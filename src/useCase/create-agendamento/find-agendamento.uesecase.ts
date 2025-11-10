import { prisma } from "../../db/database";

export async function getAgendamentosForDate(query: { day?: string; start?: string; end?: string }) {
  const where: any = {};

  if (query.day) {
    const day = new Date(query.day);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);
    where.data_hora = {
      gte: day,
      lt: nextDay,
    };
  } else if (query.start && query.end) {
    where.data_hora = {
      gte: new Date(query.start),
      lte: new Date(query.end),
    };
  }

  const agendamentos = await prisma.agendamento.findMany({
    where,
    orderBy: { data_hora: 'asc' },
  });

  return agendamentos;
}