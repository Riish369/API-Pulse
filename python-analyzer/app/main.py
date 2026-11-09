from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl, Field
from typing import Optional
from urllib.parse import urlparse
import httpx
import ipaddress
import socket
import time

app = FastAPI(title="API Pulse Analyzer", version="1.0.0")

class ProbeRequest(BaseModel):
    url: HttpUrl

class AnalyzeRequest(BaseModel):
    latency_ms: int = Field(ge=0)
    history: list[int] = Field(min_length=5, max_length=100)

def validate_public_target(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("Only valid public HTTP/HTTPS URLs are allowed")
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("Local network targets are not allowed")
    try:
        addresses = [ipaddress.ip_address(host)]
    except ValueError:
        try:
            addresses = [ipaddress.ip_address(item[4][0]) for item in socket.getaddrinfo(host, None)]
        except socket.gaierror as exc:
            raise ValueError("Hostname could not be resolved") from exc
    if not addresses:
        raise ValueError("Hostname did not resolve to an IP address")
    for address in addresses:
        if not address.is_global:
            raise ValueError("Private, loopback and reserved network targets are not allowed")

@app.get("/health")
def health():
    return {"status": "ok", "service": "api-pulse-analyzer"}

@app.post("/probe")
async def probe(payload: ProbeRequest):
    target = str(payload.url)
    try:
        validate_public_target(target)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    started = time.perf_counter()
    try:
        timeout = httpx.Timeout(10.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False,
                                     headers={"User-Agent": "APIPulse-Monitor/1.0"}) as client:
            response = await client.get(target)
        latency = round((time.perf_counter() - started) * 1000)
        is_up = 200 <= response.status_code < 400
        return {"is_up": is_up, "status_code": response.status_code,
                "latency_ms": latency, "error": None if is_up else f"HTTP status {response.status_code}"}
    except httpx.TimeoutException:
        return {"is_up": False, "status_code": None, "latency_ms": None, "error": "Request timed out"}
    except httpx.RequestError as exc:
        return {"is_up": False, "status_code": None, "latency_ms": None, "error": f"Request failed: {type(exc).__name__}"}

@app.post("/analyze")
def analyze(payload: AnalyzeRequest):
    values = sorted(payload.history)
    middle = len(values) // 2
    median = values[middle] if len(values) % 2 else (values[middle - 1] + values[middle]) / 2
    deviations = sorted(abs(value - median) for value in values)
    mad = deviations[len(deviations) // 2] if len(deviations) % 2 else (deviations[len(deviations)//2 - 1] + deviations[len(deviations)//2]) / 2
    # Robust threshold: at least 100 ms above baseline, or 3.5 scaled MADs.
    threshold = max(median + 100, median + (3.5 * 1.4826 * mad))
    anomalous = payload.latency_ms > threshold
    note = (f"Latency spike: {payload.latency_ms} ms; recent median {round(median)} ms "
            f"(anomaly threshold {round(threshold)} ms).") if anomalous else None
    return {"is_anomaly": anomalous, "note": note, "baseline_median_ms": round(median), "threshold_ms": round(threshold)}
