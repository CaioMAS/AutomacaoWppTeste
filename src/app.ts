import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import meetingRoutes from './routes/meetings.routes';
import testRoutes from './routes/test.routes';
import { authMiddleware } from './middlewares/auth.middleware';

dotenv.config();

const app = express();

// Permite que Express confie nos cabeçalhos de proxy (ex: X-Forwarded-For)
app.set('trust proxy', true);

app.use(cors());
app.use(express.json());

// Lista de IPs permitidos vinda do .env (ex: ALLOWED_IPS=192.168.0.105,177.200.10.5)
const allowedIps = process.env.ALLOWED_IPS
  ? process.env.ALLOWED_IPS.split(',').map(ip => ip.trim())
  : [];

// Middleware de filtragem de IP
app.use((req, res, next) => {
  let requestIp = req.ip || req.connection.remoteAddress || '';

  // Normaliza IPs no formato IPv6 mapeado (::ffff:192.168.0.105)
  if (requestIp.startsWith('::ffff:')) {
    requestIp = requestIp.replace('::ffff:', '');
  }

  const isAllowed =
    allowedIps.includes(requestIp) ||
    requestIp === '127.0.0.1' ||
    requestIp === '::1';

  if (isAllowed) {
    next();
  } else {
    console.warn(`Acesso negado para IP: ${requestIp}`);
    res.status(403).send('Access denied');
  }
});

// Caso queira autenticação via token (middleware customizado)
// app.use(authMiddleware);

app.use('/api/meetings', meetingRoutes);
app.use('/api/test', testRoutes);

export default app;
