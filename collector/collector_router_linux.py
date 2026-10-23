"""TL-R483G 实时流量采集器（NAS 容器 Linux 版）

与 Windows 版差异：
1. Playwright 使用自带 chromium（无 channel="chrome"）
2. ICMP 探测改用 Linux ping（-c 1 -W 1），容器 root 权限可发
3. 无 Windows 专属依赖，在 python:3.11-slim 容器内运行
"""
import json
import os
import sys
import time
import argparse
import subprocess
import concurrent.futures
from playwright.sync_api import sync_playwright

# 凭据一律通过环境变量提供，请勿硬编码
BASE = os.environ.get("ROUTER_URL", "http://192.168.102.1")  # 路由器管理地址（示例为TP-Link默认网段，请按你的网络修改）
USER = os.environ.get("ROUTER_USER", "")   # 路由器登录用户名（必填）
PWD = os.environ.get("ROUTER_PASS", "")    # 路由器登录密码（必填）
if not USER or not PWD:
    print("请通过环境变量设置路由器凭据：ROUTER_USER / ROUTER_PASS（参见 README）")
    sys.exit(1)

FIELD_ORDER = ["addr", "tx_bps", "rx_bps", "tx_pps", "rx_pps", "tx_bytes", "rx_bytes", "tx_pkts", "rx_pkts"]


def fetch_hostmap(page):
    """触发 DHCP 客户端列表菜单，返回 {ip: {mac, hostname}}"""
    try:
        page.evaluate("""() => {
            var a = document.querySelector('a[data-name="clientlist"]');
            if (a) a.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
        }""")
        page.wait_for_timeout(5000)
        rows = page.evaluate("""() => {
            var out = [];
            var rows = document.querySelectorAll('tr.grid-content-tr');
            for (var i = 0; i < rows.length; i++) {
                var cells = rows[i].querySelectorAll('td');
                if (cells.length < 4) continue;
                var t = function(el){ return (el.textContent||'').trim(); };
                var host = t(cells[1]);
                var mac = t(cells[2]);
                var ip = t(cells[3]);
                if (ip.indexOf('192.168.') === 0 && host) out.push({ip: ip, mac: mac, hostname: host});
            }
            return out;
        }""")
        hostmap = {}
        for r in rows:
            mac = r["mac"].replace("-", ":").upper()
            hostmap[r["ip"]] = {"mac": mac, "hostname": r["hostname"]}
        return hostmap
    except Exception:
        return {}


def probe_online(ips, timeout_ms=600, workers=16):
    """并发 ICMP 探测主机在线状态（Linux ping），返回 {ip: bool}"""
    online = set()
    if not ips:
        return {}
    def check(ip):
        try:
            r = subprocess.run(
                ["ping", "-c", "1", "-W", "1", "-q", ip],
                capture_output=True, text=True,
                timeout=3,
            )
            return ip, r.returncode == 0
        except Exception:
            return ip, False
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        for ip, ok in ex.map(check, ips):
            if ok:
                online.add(ip)
    return {ip: ip in online for ip in ips}


def collect(max_wait=90):
    t0 = time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(ignore_https_errors=True)
        page = ctx.new_page()
        try:
            page.goto(BASE + "/webpages/login.html", timeout=30000)
            page.wait_for_timeout(3000)
            page.locator('input[name="username"]').fill(USER)
            page.locator('input[name="username"]').press("Enter")
            page.wait_for_timeout(1200)
            pw = page.locator('input[type="password"]')
            pw.wait_for(state="visible", timeout=20000)
            pw.fill(PWD)
            page.wait_for_timeout(500)
            page.locator("text=登录").last.click()
            page.wait_for_url("**/webpages/index.html**", timeout=25000)
        except Exception as e:
            browser.close()
            return {"ok": False, "error": "login: %s" % e, "url": page.url}
        try:
            page.wait_for_timeout(2500)
            # 1) 先抓 DHCP 客户端列表（MAC + 主机名）
            hostmap = fetch_hostmap(page)
            # 2) 切回 IP 流量统计
            page.evaluate("""() => {
                var a = document.querySelector('a[data-name="ip-stat"]');
                if (a) a.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
            }""")
            page.wait_for_timeout(8000)
            # 解析 ip-stat 表格；偶发加载慢时重试一次，避免空快照覆盖真实数据
            devices = []
            for attempt in range(2):
                devices = page.evaluate("""(fields) => {
                    var out = [];
                    var rows = document.querySelectorAll('tr.grid-content-tr');
                    for (var i = 0; i < rows.length; i++) {
                        var r = rows[i];
                        var obj = {};
                        var tds = r.querySelectorAll('td');
                        for (var j = 0; j < tds.length; j++) {
                            var name = tds[j].getAttribute('name');
                            if (name) {
                                var sp = tds[j].querySelector('span.content');
                                obj[name] = sp ? sp.textContent.trim() : tds[j].textContent.trim();
                            }
                        }
                        if (obj.addr && obj.addr.indexOf('192.168.') === 0) out.push(obj);
                    }
                    return out;
                }""", FIELD_ORDER)
                if devices:
                    break
                page.wait_for_timeout(6000)
            if not devices:
                browser.close()
                return {"ok": False, "error": "parse: ip-stat 页未解析到设备（页面加载异常）", "url": page.url}
            browser.close()
            # 数值化（bytes 字段为 K/M/G 格式化字符串）
            UNIT = {"K": 1024, "M": 1024 * 1024, "G": 1024 * 1024 * 1024}

            def parse_num(s, unit=None):
                s = str(s).strip()
                if not s:
                    return 0
                try:
                    if unit:
                        num = float(s.replace(unit, ""))
                        return int(num * UNIT[unit])
                    return int(float(s))
                except Exception:
                    pass
                u = s[-1].upper()
                if u in UNIT:
                    try:
                        return int(float(s[:-1]) * UNIT[u])
                    except Exception:
                        return 0
                try:
                    return int(float(s))
                except Exception:
                    return 0

            for d in devices:
                d["tx_bps"] = parse_num(d.get("tx_bps"))
                d["rx_bps"] = parse_num(d.get("rx_bps"))
                d["tx_pps"] = parse_num(d.get("tx_pps"))
                d["rx_pps"] = parse_num(d.get("rx_pps"))
                d["tx_bytes"] = parse_num(d.get("tx_bytes"))
                d["rx_bytes"] = parse_num(d.get("rx_bytes"))
                d["tx_pkts"] = parse_num(d.get("tx_pkts"))
                d["rx_pkts"] = parse_num(d.get("rx_pkts"))
            for d in devices:
                hm = hostmap.get(d["addr"], {})
                d["mac"] = hm.get("mac", "")
                d["hostname"] = hm.get("hostname", "")
            # 并发 ICMP 探测在线状态
            online_map = probe_online([d["addr"] for d in devices])
            for d in devices:
                d["status"] = "online" if online_map.get(d["addr"]) else "offline"
            return {"ok": True, "ts": int(time.time()), "elapsed": round(time.time() - t0, 1),
                    "count": len(devices), "devices": devices, "dhcp": len(hostmap),
                    "online": sum(1 for x in devices if x["status"] == "online")}
        except Exception as e:
            browser.close()
            return {"ok": False, "error": "parse: %s" % e, "url": page.url}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="输出单行 JSON")
    ap.add_argument("--push", action="store_true", help="采集后推送到内网管理平台")
    ap.add_argument("--platform", default=""  # 必填：平台地址，例如 http://<平台IP>:8088, help="平台地址")
    ap.add_argument("--key", default=""  # 必填：与后端 COLLECTOR_KEY 一致的采集密钥, help="采集密钥")
    args = ap.parse_args()
    result = collect()
    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(json.dumps(result, ensure_ascii=False, indent=1))
    if args.push and result.get("ok"):
        import urllib.request
        payload = json.dumps({"snapshot": result}).encode()
        req = urllib.request.Request(
            args.platform + "/api/router/snapshot",
            data=payload,
            headers={"Content-Type": "application/json", "X-Collector-Key": args.key},
        )
        try:
            r = urllib.request.urlopen(req, timeout=15)
            print("PUSH:", r.status, r.read().decode("utf-8", "replace")[:120])
        except Exception as e:
            print("PUSH ERR:", repr(e))
