# API Pulse

A local API monitoring platform built with Node.js, Python, React, PostgreSQL, Redis, BullMQ and Docker Compose.

## Features
- Register and manage public HTTP/HTTPS endpoints.
- Check endpoints automatically every 60 seconds using BullMQ repeatable jobs.
- Store status codes, latency, success/failure and error details in PostgreSQL.
- Calculate uptime and show recent latency history.
- Detect latency anomalies using a simple rolling statistical baseline (Python).
- React dashboard with monitor creation, status cards, latency chart and recent checks.
- Docker Compose starts the complete stack.

## Requirements
- Docker Desktop (with Docker Compose)
- A modern browser

No local Node.js or Python installation is required when using Docker.

## Run it
1. Extract the ZIP.
2. Open a terminal in the extracted `api-pulse` directory.
3. Run:

   ```bash
   docker compose up --build
   ```

4. Open http://localhost:5173
5. Add a public endpoint such as `https://api.github.com`.

The first build can take a few minutes. Leave the terminal running. Stop the stack with `Ctrl+C`, then optionally run `docker compose down`. To also delete the local database volume, use `docker compose down -v` (this permanently deletes stored monitoring data).

## Services
| Service | Address | Responsibility |
|---|---|---|
| React dashboard | http://localhost:5173 | User interface |
| Node API | http://localhost:3000 | CRUD, database access, queue scheduling |
| Python analyzer | http://localhost:8000 | HTTP checks and anomaly detection |
| PostgreSQL | localhost:5432 | Persistent data |
| Redis | localhost:6379 | BullMQ queue and repeatable jobs |

## How a check works
1. Creating a monitor saves it in PostgreSQL and schedules a repeatable BullMQ job.
2. A BullMQ worker in the Node service receives the job.
3. Node asks the Python service to probe the registered URL.
4. Python validates the target, performs an HTTP request and returns status/latency.
5. Node fetches recent latency history and asks Python to evaluate the new result for an anomaly.
6. Node stores the check result and updates the monitor's current status.
7. The dashboard polls the Node API and displays the updated information.

## API endpoints
- `GET /api/health` — service health
- `GET /api/summary` — dashboard summary
- `GET /api/monitors` — list monitors and recent metrics
- `POST /api/monitors` — create a monitor (`{ "name": "GitHub API", "url": "https://api.github.com" }`)
- `GET /api/monitors/:id` — monitor details and checks
- `DELETE /api/monitors/:id` — delete a monitor
- `GET /api/monitors/:id/checks?limit=50` — check history

## Important notes
- This is a portfolio/local-development project, not a hardened commercial monitoring service.
- There is no user authentication or multi-tenant isolation in this first version. Do not expose it publicly as-is.
- Only public HTTP/HTTPS targets are accepted. The Python service rejects localhost/private/reserved IP targets and does not follow redirects.
- The anomaly detector is intentionally explainable: it compares a new latency to recent successful measurements using a rolling median and median absolute deviation. It is a lightweight heuristic, not machine learning.
- Checks run every 60 seconds while the monitor exists. The first check is queued immediately.
- `docker compose down -v` deletes the PostgreSQL data volume.

## Development troubleshooting
- If port 5173, 3000, 5432, 6379 or 8000 is already occupied, stop the conflicting application or change the host-side port in `docker-compose.yml`.
- If the frontend says it cannot reach the API, check `docker compose ps` and `docker compose logs api`.
- View all logs with `docker compose logs -f`.
- Rebuild after code changes with `docker compose up --build`.
