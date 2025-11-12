import { Request, Response, NextFunction, RequestHandler } from 'express';

export const authMiddleware: RequestHandler = (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) {
    res.status(401).json({ error: 'Token não fornecido.' });
    return; // 👈 importante: encerra sem retornar o Response
  }

  const providedToken = token.split(' ')[1];

  if (providedToken !== process.env.AUTH_TOKEN) {
    res.status(403).json({ error: 'Token inválido.' });
    return;
  }

  next(); // segue para a rota
};
