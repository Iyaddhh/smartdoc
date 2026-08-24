# ==========================================
# Stage 1: Build dependencies & wheels
# ==========================================
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ==========================================
# Stage 2: Clean Runtime Environment
# ==========================================
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/install/bin:$PATH"
ENV PYTHONPATH="/install/lib/python3.11/site-packages:$PYTHONPATH"

WORKDIR /app

# Install minimal headless runtime dependencies (official Debian Bookworm packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-core \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    default-jre-headless \
    ghostscript \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    pngquant \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /install

# Create non-root system user for security hardening
RUN useradd -m -u 1001 appuser

# Copy backend application source code
COPY . .

# Setup permissions for storage, logs, and temporary workspace
RUN mkdir -p /app/storage /app/logs /tmp && \
    chown -R appuser:appuser /app /tmp

# Switch to non-root user
USER appuser

EXPOSE 8000

# Run Uvicorn with single worker process for accurate in-memory asyncio.Semaphore concurrency
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
