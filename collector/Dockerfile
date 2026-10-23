# 内网路由器采集容器：Playwright + Chromium 常驻循环（不依赖任何 Windows 机器）
FROM python:3.11-slim

# chromium 运行所需系统依赖 + ping（ICMP 探测）
RUN apt-get update && apt-get install -y --no-install-recommends \
        iputils-ping \
        curl \
        ca-certificates \
        fonts-liberation \
        libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
        libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
        libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir playwright==1.44.0 \
    && playwright install chromium \
    && playwright install-deps chromium || true

WORKDIR /app
COPY collector_router_linux.py collector_loop_linux.py /app/

CMD ["python", "-u", "collector_loop_linux.py"]
