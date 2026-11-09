import { Router } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { scheduleMonitor, removeMonitorSchedule } from './queue.js';

export const router = Router();
const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  url: z.string().trim().url().max(2048).refine(value => /^https?:\/\//i.test(value), 'Only HTTP and HTTPS URLs are supported')
});

function metrics(checks) {
  const total = checks.length;
  const successful = checks.filter(check => check.isUp).length;
  const latencies = checks.filter(check => check.latencyMs !== null).map(check => check.latencyMs);
  const averageLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  return { uptime: total ? Number(((successful / total) * 100).toFixed(2)) : null, averageLatency, checks: total };
}

router.get('/health', async (_req, res) => {
  res.json({ status: 'ok', service: 'api-pulse-backend', timestamp: new Date().toISOString() });
});

router.get('/summary', async (_req, res, next) => {
  try {
    const [total, up, down, checks] = await Promise.all([
      prisma.monitor.count(),
      prisma.monitor.count({ where: { currentUp: true } }),
      prisma.monitor.count({ where: { currentUp: false } }),
      prisma.check.findMany({ orderBy: { checkedAt: 'desc' }, take: 100 })
    ]);
    const latencyValues = checks.filter(c => c.latencyMs !== null).map(c => c.latencyMs);
    res.json({ totalMonitors: total, upMonitors: up, downMonitors: down,
      averageLatency: latencyValues.length ? Math.round(latencyValues.reduce((a,b)=>a+b,0)/latencyValues.length) : null,
      recentAnomalies: checks.filter(c => c.isAnomaly).length });
  } catch (error) { next(error); }
});

router.get('/monitors', async (_req, res, next) => {
  try {
    const monitors = await prisma.monitor.findMany({
      orderBy: { createdAt: 'desc' },
      include: { checks: { orderBy: { checkedAt: 'desc' }, take: 50 } }
    });
    res.json(monitors.map(m => ({ ...m, metrics: metrics(m.checks), checks: m.checks.slice(0, 10) })));
  } catch (error) { next(error); }
});

router.post('/monitors', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    const monitor = await prisma.monitor.create({ data: parsed.data });
    await scheduleMonitor(monitor.id);
    res.status(201).json(monitor);
  } catch (error) { next(error); }
});

router.get('/monitors/:id', async (req, res, next) => {
  try {
    const monitor = await prisma.monitor.findUnique({
      where: { id: req.params.id },
      include: { checks: { orderBy: { checkedAt: 'desc' }, take: 100 } }
    });
    if (!monitor) return res.status(404).json({ error: 'Monitor not found' });
    res.json({ ...monitor, metrics: metrics(monitor.checks) });
  } catch (error) { next(error); }
});

router.get('/monitors/:id/checks', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const checks = await prisma.check.findMany({ where: { monitorId: req.params.id }, orderBy: { checkedAt: 'desc' }, take: limit });
    res.json(checks);
  } catch (error) { next(error); }
});

router.delete('/monitors/:id', async (req, res, next) => {
  try {
    const existing = await prisma.monitor.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Monitor not found' });
    await removeMonitorSchedule(existing.id);
    await prisma.monitor.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (error) { next(error); }
});
