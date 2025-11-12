import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import meetingRoutes from './routes/meetings.routes';
import testRoutes from './routes/test.routes';
import { authMiddleware } from './middlewares/auth.middleware';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// 🔒 Middleware global (todas as rotas exigem token)
// app.use(authMiddleware);

// 🔒 Ou aplique em rotas específicas
app.use('/api/meetings', meetingRoutes);
app.use('/api/test', testRoutes);

export default app;
