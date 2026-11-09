import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { prisma } from './db.js';
import { router } from './routes.js';
import './queue.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '32kb' }));
app.use('/api', router);
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(config.port, () => console.log(`API Pulse backend listening on ${config.port}`));

async function shutdown() {
  console.log('Shutting down API Pulse...');
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
