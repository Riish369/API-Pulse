import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  pythonServiceUrl: process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'
};
