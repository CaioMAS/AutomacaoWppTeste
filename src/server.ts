// src/server.ts
import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { startWhatsApp } from './services/whatsappService';
import { iniciarMonitoramentoDeLembretes } from './services/reminderScheduler';
import { iniciarCheckMeetingsMissingDay8h } from './services/checkMeetingsMissingDay';
import { enviarReminders30mAgora } from './services/reminder30minutes'

import cron from 'node-cron';
import { checkMeetingsMissing24Hours } from './services/checkMeetingsMissing24Hours';
import enviarMensagemMotivacionalAgora from './jobs/mensagemMotivacionalDiaria';


startWhatsApp();
iniciarMonitoramentoDeLembretes(5);
iniciarCheckMeetingsMissingDay8h();
//enviarMensagemMotivacionalAgora();

// Agenda o envio diário às 08:00 da manhã (horário de Brasília)
// AGORA (roda de Segunda a Sexta):
cron.schedule("0 8 * * 1-5", async () => {
  try {
    console.log("⏰ Enviando mensagem motivacional (Seg-Sex 08:00 BRT)...");
    await enviarMensagemMotivacionalAgora();
    console.log("✅ Mensagem motivacional enviada com sucesso!");
  } catch (e: any) {
    console.error("❌ Erro ao enviar mensagem motivacional:", e?.message || e);
  }
}, {
  timezone: "America/Sao_Paulo"
});

// // roda a cada 5 minutos pra capturar a janela ~30m
cron.schedule(
  '*/5 * * * *',
  async () => {
    await enviarReminders30mAgora({
      instancia: 'AgenteIA',            
      numeroDestino: process.env.NUMERO_DESTINO,    
      tz: 'America/Sao_Paulo',
      janelaMinutos: { min: 29, max: 31 },
    });
  },
  { timezone: 'America/Sao_Paulo' }
);

// //24h antes, a cada 15 min
cron.schedule('*/15 * * * *', async () => {
  try {
    console.log('⏰ Executando lembretes de 24h antes...');
    await checkMeetingsMissing24Hours();
    console.log('✅ Lembretes 24h processados.');
  } catch (err) {
    console.error('❌ Erro no 24h:', err);
  }
});

const PORT = process.env.PORT || 5556;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
