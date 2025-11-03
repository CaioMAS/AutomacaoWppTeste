import { Router } from 'express';
// calendarService.ts
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';


const router = Router();

/**
 * @route   GET /api/test/colors
 * @desc    Retorna todas as cores disponíveis no Google Calendar (event e calendar)
 * @access  Público (apenas debug)
 */
router.get('/colors', async (req, res) => {
  try {
    // 🔐 Autenticação com o mesmo padrão usado nas outras funções
    const auth = new JWT({
      email: process.env.GOOGLE_CALENDAR_EMAIL, // e-mail do Service Account
      key: process.env.GOOGLE_CALENDAR_PRIVATE_KEY?.split(String.raw`\n`).join('\n') || '',
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // 🔎 Chamada ao endpoint oficial
    const { data } = await calendar.colors.get();

    // 🎨 Extrai apenas as cores de eventos (opcional)
    const eventColors = data.event || {};
    const calendarColors = data.calendar || {};

    console.log('🟩 Cores de eventos retornadas:', eventColors);

    res.json({
      success: true,
      eventColors,
      calendarColors,
      message: '✅ Paleta de cores obtida com sucesso via Google Calendar API.',
    });
  } catch (e: any) {
    console.error('❌ Erro ao buscar cores:', e.message);
    res.status(500).json({
      success: false,
      error: e.message,
      message:
        'Erro ao tentar buscar cores do Google Calendar. Verifique se GOOGLE_CALENDAR_EMAIL e PRIVATE_KEY estão corretos.',
    });
  }
});

export default router;
