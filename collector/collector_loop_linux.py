"""NAS 容器内采集循环：默认 10 分钟抓一次路由器 → 推送平台；
平台点击刷新时（POST /api/collect/trigger）立即抓取（5 秒内响应）。
日志输出到 stdout（docker logs 可见）
"""
import os
import sys
import time
import json
import subprocess
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PLATFORM = os.environ.get("PLATFORM", "")  # 必填：平台地址（后端对外暴露地址）
KEY = os.environ.get("COLLECTOR_KEY", "")  # 必填：与后端 COLLECTOR_KEY 一致的采集密钥
INTERVAL = int(os.environ.get("COLLECTOR_INTERVAL", "600"))  # 默认 10 分钟
POLL = int(os.environ.get("COLLECTOR_POLL", "5"))  # 即时抓取轮询间隔（秒）
LOG = os.environ.get("COLLECTOR_LOG", os.path.join(HERE, "collector.log"))


def log(line):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = "%s %s" % (ts, line)
    print(line, flush=True)
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def run_once():
    py = sys.executable
    script = os.path.join(HERE, "collector_router_linux.py")
    try:
        r = subprocess.run(
            [py, "-u", script, "--push", "--platform", PLATFORM, "--key", KEY],
            capture_output=True, text=True, timeout=120,
        )
        out = (r.stdout or "").strip().splitlines()
        tail = out[-1:] if out else []
        if r.returncode != 0 and not tail:
            tail = ["RC=%s %s" % (r.returncode, (r.stderr or "")[:200])]
        return tail
    except Exception as e:
        return ["ERR " + repr(e)]


def check_state():
    """查询平台即时抓取请求与总开关状态（返回 triggered, enabled）"""
    try:
        req = urllib.request.Request(
            PLATFORM + "/api/collect/pending",
            headers={"X-Collector-Key": KEY},
        )
        data = json.loads(urllib.request.urlopen(req, timeout=8).read().decode("utf-8", "replace"))
        return bool(data.get("triggered")), data.get("enabled", True)
    except Exception as e:
        log("trigger check ERR " + repr(e)[:120])
        return False, True


def main():
    if not PLATFORM or not KEY:
        log("缺少环境变量 PLATFORM / COLLECTOR_KEY，采集循环退出")
        return
    log("collector loop start pid=%s interval=%ds poll=%ds platform=%s" % (os.getpid(), INTERVAL, POLL, PLATFORM))
    last_run = 0.0
    while True:
        now = time.time()
        try:
            triggered, enabled = check_state()
            if not enabled:
                # 平台"抓取总开关"关闭：暂停一切抓取（定时/即时都不跑）
                log("抓取总开关已关闭，暂停抓取")
                last_run = 0.0
                time.sleep(POLL)
                continue
            if triggered:
                log(">> 即时抓取（平台刷新触发）")
                last_run = now
                run_once_tail = run_once()
                log(" | ".join(run_once_tail))
            elif now - last_run >= INTERVAL:
                last_run = now
                log(">> 定时抓取（%ds 周期）" % INTERVAL)
                run_once_tail = run_once()
                log(" | ".join(run_once_tail))
        except Exception as e:
            log("LOOP ERR " + repr(e))
        time.sleep(POLL)


main()
