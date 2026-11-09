import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { config } from './config.js';
import { prisma } from './db.js';

export const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
export const monitorQueue = new Queue('monitor-checks', { connection });

export async function scheduleMonitor(monitorId) {
  await monitorQueue.add('check-monitor', { monitorId }, {
    jobId: `monitor-${monitorId}`,
    repeat: { every: 60_000 },
    removeOnComplete: 100,
    removeOnFail: 100
  });
  await monitorQueue.add('check-monitor', { monitorId }, {
    jobId: `initial-${monitorId}`,
    removeOnComplete: true,
    removeOnFail: 100
  });
}

export async function removeMonitorSchedule(monitorId) {
  const repeatables = await monitorQueue.getRepeatableJobs();
  for (const job of repeatables) {
    if (job.name === 'check-monitor' && job.key.includes(`monitor-${monitorId}`)) {
      await monitorQueue.removeRepeatableByKey(job.key);
    }
  }
}

async function runCheck(monitorId) {
  const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
  if (!monitor || !monitor.isActive) return;

  let probe;
  try {
    const response = await fetch(`${config.pythonServiceUrl}/probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: monitor.url }),
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`Analyzer returned HTTP ${response.status}`);
    probe = await response.json();
  } catch (error) {
    probe = { is_up: false, status_code: null, latency_ms: null, error: `Analyzer error: ${error.message}` };
  }

  const recent = await prisma.check.findMany({
    where: { monitorId, isUp: true, latencyMs: { not: null } },
    orderBy: { checkedAt: 'desc' },
    take: 30,
    select: { latencyMs: true }
  });

  let analysis = { is_anomaly: false, note: null };
  if (probe.is_up && probe.latency_ms !== null && recent.length >= 5) {
    try {
      const response = await fetch(`${config.pythonServiceUrl}/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          latency_ms: probe.latency_ms,
          history: recent.map(item => item.latencyMs)
        }),
        signal: AbortSignal.timeout(5_000)
      });
      if (response.ok) analysis = await response.json();
    } catch (error) {
      console.error('Anomaly analysis failed:', error.message);
    }
  }

  await prisma.$transaction([
    prisma.check.create({
      data: {
        monitorId,
        statusCode: probe.status_code,
        latencyMs: probe.latency_ms,
        isUp: Boolean(probe.is_up),
        error: probe.error || null,
        isAnomaly: Boolean(analysis.is_anomaly),
        anomalyNote: analysis.note || null
      }
    }),
    prisma.monitor.update({
      where: { id: monitorId },
      data: { currentUp: Boolean(probe.is_up), lastChecked: new Date() }
    })
  ]);
}

export const monitorWorker = new Worker(
  'monitor-checks',
  async job => {
    if (job.name === 'check-monitor') await runCheck(job.data.monitorId);
  },
  { connection, concurrency: 10 }
);

monitorWorker.on('completed', job => console.log(`Check job ${job.id} completed`));
monitorWorker.on('failed', (job, error) => console.error(`Check job ${job?.id} failed:`, error));
