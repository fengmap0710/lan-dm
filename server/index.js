// 内网设备管理平台 — 后端服务
const express = require('express');
const net = require('net');
const store = require('./store');
const auth = require('./auth');

store.load();
const { db, save, nextId } = store;

const app = express();
app.use(express.json({ limit: '10mb' }));
const PORT = process.env.PORT || 3001;

// ---------- NAS 内网探测（TCP 并发，兜底在线状态） ----------
// 采集器正常时 ICMP 状态为准；采集器离线/延迟时，由 NAS 常驻探测维持在线状态，
// 前端实时视图不依赖本机采集循环，响应更快、更稳定。
const NAS_IP = process.env.NAS_IP || ''; // 需要豁免恒在线的设备IP（如平台自身所在NAS），默认不豁免
const PROBE_INTERVAL_MS = 30000;
const PROBE_PORTS = [445, 135, 3389, 22, 80, 443, 8080];
const PROBE_TIMEOUT_MS = 700;
const SNAPSHOT_FRESH_MS = 90000; // 采集器快照在此窗口内视为新鲜，ICMP 状态优先
let probeLatest = { ts: 0, results: {}, scanned: 0, online: 0 };

function probePort(ip, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(PROBE_TIMEOUT_MS);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, ip);
  });
}

async function probeDevice(ip) {
  const results = await Promise.all(PROBE_PORTS.map((p) => probePort(ip, p)));
  const openPorts = PROBE_PORTS.filter((_, i) => results[i]);
  return { online: openPorts.length > 0, openPorts };
}

// 单设备权威在线状态：NAS 豁免恒在线；快照新鲜用采集器 ICMP；否则用 NAS 探测兜底
function effectiveStatus(ip, snapStatus) {
  if (ip === NAS_IP) return 'online';
  const fresh =
    db.routerRealtime &&
    Date.now() - new Date(db.routerRealtime.receivedAt || 0).getTime() <= SNAPSHOT_FRESH_MS;
  if (fresh) return snapStatus || 'online';
  const r = probeLatest.results[ip];
  if (r) return r.online ? 'online' : 'offline';
  return snapStatus || 'online';
}

async function probeRound() {
  // 抓取总开关关闭时：探测也一并暂停（"停止一切抓取"），保留上次结果
  if (db.collectorEnabled === false) return;
  const ips = new Set();
  for (const d of db.devices) {
    if (d && d.ip) ips.add(d.ip);
  }
  if (db.routerRealtime && Array.isArray(db.routerRealtime.devices)) {
    for (const d of db.routerRealtime.devices) {
      if (d && d.addr) ips.add(d.addr);
    }
  }
  const list = [...ips];
  const results = {};
  const BATCH = 32;
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    const rs = await Promise.all(batch.map((ip) => probeDevice(ip)));
    for (let k = 0; k < batch.length; k++) results[batch[k]] = rs[k];
  }
  const online = Object.values(results).filter((r) => r.online).length;
  probeLatest = { ts: Math.floor(Date.now() / 1000), results, scanned: list.length, online };
  // 同步台账在线状态（按权威规则，采集器新鲜时以 ICMP 为准）
  for (const d of db.devices) {
    if (!d || !d.ip) continue;
    d.status = effectiveStatus(d.ip, d.status);
    d.lastProbeAt = new Date().toISOString();
  }
  save();
}
probeRound();
setInterval(probeRound, PROBE_INTERVAL_MS);

// ---------- 认证 ----------
app.get('/api/auth/status', (req, res) => {
  res.json({ initialized: db.users.length > 0 });
});

app.post('/api/auth/init', (req, res) => {
  if (db.users.length > 0) return res.status(400).json({ error: '已存在用户，不可重复初始化' });
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || password.length < 6) {
    return res.status(400).json({ error: '账号不能为空，密码至少 6 位' });
  }
  if (db.users.some((u) => u.username === username)) {
    return res.status(400).json({ error: '账号已存在' });
  }
  const { salt, hash } = auth.hashPassword(password);
  const user = { id: nextId(), username, passwordHash: hash, salt, role: 'admin', createdAt: new Date().toISOString() };
  db.users.push(user);
  save();
  res.json({ token: auth.makeToken(user.id), user: auth.publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = db.users.find((u) => u.username === username);
  if (!user || !auth.verifyPassword(password, user.salt, user.passwordHash)) {
    return res.status(401).json({ error: '账号或密码不正确' });
  }
  res.json({ token: auth.makeToken(user.id), user: auth.publicUser(user) });
});

app.get('/api/auth/me', auth.requireAuth, (req, res) => {
  res.json({ user: auth.publicUser(req.user) });
});

app.put('/api/auth/password', auth.requireAuth, (req, res) => {
  const oldPassword = String(req.body.oldPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (!auth.verifyPassword(oldPassword, req.user.salt, req.user.passwordHash)) {
    return res.status(400).json({ error: '当前密码不正确' });
  }
  if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
  const { salt, hash } = auth.hashPassword(newPassword);
  req.user.passwordHash = hash;
  req.user.salt = salt;
  save();
  res.json({ ok: true });
});

// ---------- 用户管理（仅管理员） ----------
app.get('/api/users', auth.requireAuth, auth.requireAdmin, (req, res) => {
  res.json({ users: db.users.map(auth.publicUser) });
});

app.post('/api/users', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const role = req.body.role === 'user' ? 'user' : 'admin';
  if (!username || password.length < 6) {
    return res.status(400).json({ error: '账号不能为空，密码至少 6 位' });
  }
  if (db.users.some((u) => u.username === username)) {
    return res.status(400).json({ error: '账号已存在' });
  }
  const { salt, hash } = auth.hashPassword(password);
  const user = { id: nextId(), username, passwordHash: hash, salt, role, createdAt: new Date().toISOString() };
  db.users.push(user);
  save();
  res.json({ user: auth.publicUser(user) });
});

app.put('/api/users/:id', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (req.body.username) {
    const name = String(req.body.username).trim();
    if (!name) return res.status(400).json({ error: '账号不能为空' });
    if (db.users.some((u) => u.username === name && u.id !== user.id)) {
      return res.status(400).json({ error: '账号已存在' });
    }
    user.username = name;
  }
  if (req.body.role === 'admin' || req.body.role === 'user') {
    if (user.id === req.user.id && req.body.role !== 'admin') {
      return res.status(400).json({ error: '不能降级自己的管理员角色' });
    }
    user.role = req.body.role;
  }
  if (typeof req.body.password === 'string' && req.body.password) {
    if (req.body.password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
    const { salt, hash } = auth.hashPassword(req.body.password);
    user.passwordHash = hash;
    user.salt = salt;
  }
  save();
  res.json({ user: auth.publicUser(user) });
});

app.delete('/api/users/:id', auth.requireAuth, auth.requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: '不能删除当前登录账号' });
  const idx = db.users.findIndex((u) => u.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: '用户不存在' });
  const target = db.users[idx];
  if (target.role === 'admin' && db.users.filter((u) => u.role === 'admin').length <= 1) {
    return res.status(400).json({ error: '至少保留一个管理员账号' });
  }
  db.users.splice(idx, 1);
  save();
  res.json({ ok: true });
});

// ---------- 资源 CRUD（登录即可，管理员+普通用户都能配置） ----------
function crud(collection, exclude) {
  return {
    list: (req, res) => {
      const items = db[collection].map((it) => {
        const o = { ...it };
        if (exclude) for (const k of exclude) delete o[k];
        return o;
      });
      res.json({ items });
    },
    create: (req, res) => {
      const body = { ...req.body };
      body.id = nextId();
      db[collection].push(body);
      save();
      res.status(201).json({ item: body });
    },
    update: (req, res) => {
      const item = db[collection].find((it) => it.id === req.params.id);
      if (!item) return res.status(404).json({ error: '记录不存在' });
      Object.assign(item, req.body, { id: item.id });
      // 设备：手动设置过类型后，快照自动推断不再覆盖
      if (collection === 'devices' && req.body.deviceType) item.typeAuto = false;
      save();
      res.json({ item });
    },
    remove: (req, res) => {
      const idx = db[collection].findIndex((it) => it.id === req.params.id);
      if (idx < 0) return res.status(404).json({ error: '记录不存在' });
      db[collection].splice(idx, 1);
      save();
      res.json({ ok: true });
    },
  };
}

const devicesCrud = crud('devices');
app.get('/api/devices', auth.requireAuth, devicesCrud.list);
app.post('/api/devices', auth.requireAuth, devicesCrud.create);
app.put('/api/devices/:id', auth.requireAuth, devicesCrud.update);
app.delete('/api/devices/:id', auth.requireAuth, devicesCrud.remove);

// 批量更新设备（勾选多台：批量设置类型/使用人）
app.post('/api/devices/batch', auth.requireAuth, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const patch = req.body.patch || {};
  if (!ids.length) return res.status(400).json({ error: 'ids 不能为空' });
  let n = 0;
  for (const dev of db.devices) {
    if (!ids.includes(dev.id)) continue;
    if (typeof patch.deviceType === 'string' && patch.deviceType) {
      dev.deviceType = patch.deviceType;
      dev.typeAuto = false;
    }
    if (typeof patch.owner === 'string' && patch.owner !== undefined) dev.owner = patch.owner;
    if (typeof patch.note === 'string' && patch.note !== undefined) dev.note = patch.note;
    n += 1;
  }
  save();
  res.json({ ok: true, updated: n });
});

const rulesCrud = crud('rules');
app.get('/api/rules', auth.requireAuth, rulesCrud.list);
app.post('/api/rules', auth.requireAuth, rulesCrud.create);
app.put('/api/rules/:id', auth.requireAuth, rulesCrud.update);
app.delete('/api/rules/:id', auth.requireAuth, rulesCrud.remove);

const policiesCrud = crud('policies');
app.get('/api/policies', auth.requireAuth, policiesCrud.list);
app.post('/api/policies', auth.requireAuth, policiesCrud.create);
app.put('/api/policies/:id', auth.requireAuth, policiesCrud.update);
app.delete('/api/policies/:id', auth.requireAuth, policiesCrud.remove);

// ---------- 路由器凭据（仅管理员） ----------
app.get('/api/router-credential', auth.requireAuth, auth.requireAdmin, (req, res) => {
  res.json({ credential: db.routerCredential });
});

app.put('/api/router-credential', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const url = String(req.body.url || '').trim();
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  if (!url || !username || !password) {
    return res.status(400).json({ error: '地址、账号、密码均不能为空' });
  }
  db.routerCredential = { url, username, password, updatedAt: new Date().toISOString() };
  save();
  res.json({ credential: db.routerCredential });
});

// ---------- 流量记录 ----------
app.get('/api/traffic', auth.requireAuth, (req, res) => {
  let items = [...db.trafficRecords];
  if (req.query.ip) items = items.filter((t) => t.ip === req.query.ip);
  if (req.query.category) items = items.filter((t) => t.category === req.query.category);
  if (req.query.from) items = items.filter((t) => t.recordedAt >= req.query.from);
  if (req.query.to) items = items.filter((t) => t.recordedAt <= req.query.to);
  res.json({ items });
});

app.post('/api/traffic', auth.requireAuth, (req, res) => {
  const t = { ...req.body };
  if (!t.ip) return res.status(400).json({ error: 'IP 不能为空' });
  t.id = nextId();
  t.recordedAt = t.recordedAt || new Date().toISOString();
  t.bytesDown = Number(t.bytesDown) || 0;
  t.bytesUp = Number(t.bytesUp) || 0;
  t.durationSec = Number(t.durationSec) || 0;
  t.category = t.category || 'other';
  t.source = t.source || 'manual';
  db.trafficRecords.push(t);
  save();
  res.status(201).json({ item: t });
});

app.post('/api/traffic/import', auth.requireAuth, (req, res) => {
  const list = Array.isArray(req.body.items) ? req.body.items : [];
  let added = 0;
  const now = new Date().toISOString();
  for (const raw of list) {
    const ip = String(raw.ip || '').trim();
    if (!ip) continue;
    const t = {
      id: nextId(),
      ip,
      mac: String(raw.mac || '').trim() || undefined,
      owner: String(raw.owner || '').trim() || undefined,
      category: ['office', 'download', 'video', 'game', 'other'].includes(raw.category)
        ? raw.category
        : 'other',
      label: String(raw.label || '').trim() || undefined,
      bytesDown: Number(raw.bytesDown) || 0,
      bytesUp: Number(raw.bytesUp) || 0,
      durationSec: Number(raw.durationSec) || 0,
      recordedAt: raw.recordedAt || now,
      source: raw.source || 'import',
    };
    db.trafficRecords.push(t);
    added += 1;
  }
  save();
  res.status(201).json({ added });
});

app.delete('/api/traffic/:id', auth.requireAuth, (req, res) => {
  const idx = db.trafficRecords.findIndex((t) => t.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: '记录不存在' });
  db.trafficRecords.splice(idx, 1);
  save();
  res.json({ ok: true });
});

app.get('/api/traffic/stats', auth.requireAuth, (req, res) => {
  const range = String(req.query.range || 'all');
  const DAY = 24 * 3600 * 1000;
  // 按北京时间自然日切分（day=今天0点起、week=近7自然日、month=近30自然日）
  const UTC8 = 8 * 3600 * 1000;
  const startOfToday = Math.floor((Date.now() + UTC8) / DAY) * DAY - UTC8;
  const cutoff = range === 'day' ? startOfToday : range === 'week' ? startOfToday - 6 * DAY : range === 'month' ? startOfToday - 29 * DAY : 0;
  const byIp = {};
  const byCategory = {};
  const byDay = {};
  let totalDown = 0;
  let totalUp = 0;
  let totalDuration = 0;
  let totalRecords = 0;
  for (const t of db.trafficRecords) {
    if (cutoff > 0 && new Date(t.recordedAt).getTime() < cutoff) continue;
    totalRecords += 1;
    totalDown += t.bytesDown || 0;
    totalUp += t.bytesUp || 0;
    totalDuration += t.durationSec || 0;
    if (!byIp[t.ip]) byIp[t.ip] = { ip: t.ip, mac: t.mac, owner: t.owner, bytesDown: 0, bytesUp: 0, durationSec: 0, count: 0 };
    byIp[t.ip].bytesDown += t.bytesDown || 0;
    byIp[t.ip].bytesUp += t.bytesUp || 0;
    byIp[t.ip].durationSec += t.durationSec || 0;
    byIp[t.ip].count += 1;
    const cat = t.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = { bytesDown: 0, count: 0 };
    byCategory[cat].bytesDown += t.bytesDown || 0;
    byCategory[cat].count += 1;
    const day = String(t.recordedAt || '').slice(0, 10);
    if (day) {
      if (!byDay[day]) byDay[day] = { bytesDown: 0, bytesUp: 0, durationSec: 0 };
      byDay[day].bytesDown += t.bytesDown || 0;
      byDay[day].bytesUp += t.bytesUp || 0;
      byDay[day].durationSec += t.durationSec || 0;
    }
  }
  res.json({
    total: { records: totalRecords, bytesDown: totalDown, bytesUp: totalUp, durationSec: totalDuration },
    byIp: Object.values(byIp).sort((a, b) => b.bytesDown - a.bytesDown),
    byCategory: Object.entries(byCategory).map(([k, v]) => ({ category: k, ...v })),
    byDay: Object.entries(byDay)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => ({ day: k, ...v })),
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// ---------- 路由器实时快照（采集器推送 / 前端读取） ----------
const COLLECTOR_KEY = process.env.COLLECTOR_KEY || ''; // 必填：与采集器一致的密钥（见 .env）
const REALTIME_HISTORY_LIMIT = 120; // 内存保留最近 120 轮快照（约 1 小时@30s）

// 根据主机名关键词推断设备类型（推断不了返回 ''，保持"其他"）
function inferDeviceType(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return '';
  const mobile = ['iphone', 'ipad', 'huawei', 'honor', 'redmi', 'xiaomi', 'mi ', 'oppo', 'oneplus',
    'vivo', 'realme', 'samsung', 'galaxy', 'nova', 'p30', 'p40', 'p50', 'mate', 'reno', 'k80', 'k70',
    'mi10', 'mi11', 'mi12', 'mi13', 'mi14', 'mate', 'magic', 'iqoo', 'motorola', 'pixel', 'al00', 'tl00', 'an00', 'dn00'];
  // 小米/红米型号（M2004J7BC、M2101K7AG 等）
  const xiaomiModel = /^m\d{4}/i;
  const notebook = ['desktop', 'laptop', 'notebook', 'thinkpad', 'dell', 'hp-', 'lenovo', 'macbook', 'surface', 'asus', 'rog', 'yoga', 'xiaoxin'];
  const camera = ['camera', 'cam-', '360_camera', 'ipc-', 'dahua', 'hikvision', 'ezviz'];
  for (const k of mobile) {
    if (h.includes(k)) return '手机';
  }
  if (xiaomiModel.test(h)) return '手机';
  for (const k of notebook) {
    if (h.includes(k)) return '笔记本';
  }
  for (const k of camera) {
    if (h.includes(k)) return '摄像头';
  }
  return '';
}

function collectorAuth(req, res, next) {
  const key =
    (req.headers['x-collector-key'] || '') === COLLECTOR_KEY
      ? COLLECTOR_KEY
      : String(req.body && req.body.collectorKey || '');
  if (key !== COLLECTOR_KEY) return res.status(401).json({ error: '采集密钥无效' });
  next();
}

// 采集器推送快照
app.post('/api/router/snapshot', collectorAuth, (req, res) => {
  // 抓取总开关关闭时：忽略快照（不落库、不建设备），恢复开启后自动重新发现
  if (db.collectorEnabled === false) {
    return res.json({ ok: true, received: 0, ignored: true, reason: '抓取总开关已关闭' });
  }
  const snap = req.body && req.body.snapshot;
  if (!snap || !Array.isArray(snap.devices)) {
    return res.status(400).json({ error: 'snapshot.devices 必须为数组' });
  }
  if (snap.devices.length === 0) {
    // 空快照说明采集端页面解析异常，拒绝写入，保护已有实时数据
    return res.status(400).json({ error: '空快照已拒绝（采集端页面异常）' });
  }
  const ts = Number(snap.ts) || Date.now();
  const normalized = {
    ts,
    receivedAt: new Date().toISOString(),
    count: snap.devices.length,
    devices: snap.devices.map((d) => ({
      addr: String(d.addr || d.ip || ''),
      mac: String(d.mac || ''),
      hostname: String(d.hostname || ''),
      tx_bps: Number(d.tx_bps) || 0,
      rx_bps: Number(d.rx_bps) || 0,
      status: String(d.status || ''),
      tx_pps: Number(d.tx_pps) || 0,
      rx_pps: Number(d.rx_pps) || 0,
      tx_bytes: Number(d.tx_bytes) || 0,
      rx_bytes: Number(d.rx_bytes) || 0,
      tx_pkts: Number(d.tx_pkts) || 0,
      rx_pkts: Number(d.rx_pkts) || 0,
    })),
  };
  db.routerRealtime = normalized;
  if (!realtimeHistory) realtimeHistory = [];
  realtimeHistory.push(normalized);
  if (realtimeHistory.length > REALTIME_HISTORY_LIMIT) realtimeHistory.shift();

  // ---- 自动同步：快照 → 设备台账 / 流量统计 ----
  const nowIso = new Date().toISOString();
  for (const d of normalized.devices) {
    const ip = d.addr;
    if (!ip) continue;
    const rxTotalMb = d.rx_bytes / (1024 * 1024);
    const txTotalMb = d.tx_bytes / (1024 * 1024);
    const rxRateKb = d.rx_bps / 8;
    const txRateKb = d.tx_bps / 8;

    // 1) 设备台账 upsert（保留用户已填字段，不覆盖）
    let dev = db.devices.find((x) => x.ip === ip);
    if (dev) {
      // 在线状态以采集器实时探测为准（offline/online）；未提供时保持 online 兼容旧快照
      dev.status = d.status === 'online' || d.status === 'offline' ? d.status : 'online';
      dev.rxRate = rxRateKb;
      dev.txRate = txRateKb;
      dev.rxTotal = rxTotalMb;
      dev.txTotal = txTotalMb;
      dev.exempt = dev.exempt || ip === NAS_IP;
      dev.lastSeen = nowIso;
      // 补全 MAC/主机名（用户手动填过的保留；主机名相同或为空才更新）
      if (!dev.mac && d.mac) dev.mac = d.mac;
      if (d.hostname && (!dev.hostname || dev.hostname === d.hostname)) {
        if (!dev.hostname) dev.hostname = d.hostname;
        // 类型自动推断（仅当类型未被人工确认过）
        if (dev.typeAuto !== false && dev.deviceType === '其他') {
          const t = inferDeviceType(dev.hostname || d.hostname);
          if (t) dev.deviceType = t;
        }
      }
    } else {
      db.devices.push({
        id: store.nextId(),
        ip,
        mac: d.mac || '',
        hostname: d.hostname || '',
        deviceType: inferDeviceType(d.hostname || '') || '其他',
        owner: '',
        status: 'online',
        rxRate: rxRateKb,
        txRate: txRateKb,
        rxTotal: rxTotalMb,
        txTotal: txTotalMb,
        exempt: ip === NAS_IP,
        note: '路由器自动发现',
        lastSeen: nowIso,
        createdAt: nowIso,
      });
    }

    // 2) 流量统计 upsert：每天每台设备保留一条快照记录（同日覆盖，跨日累积历史），不覆盖手动记录
    const dayKey = String(nowIso).slice(0, 10);
    const rec = db.trafficRecords.find(
      (t) => t.ip === ip && t.source === 'snapshot' && String(t.recordedAt || '').slice(0, 10) === dayKey,
    );
    if (rec) {
      rec.bytesDown = d.rx_bytes;
      rec.bytesUp = d.tx_bytes;
      rec.recordedAt = nowIso;
    } else {
      db.trafficRecords.push({
        id: store.nextId(),
        ip,
        category: 'other',
        label: ip,
        bytesDown: d.rx_bytes,
        bytesUp: d.tx_bytes,
        durationSec: 0,
        recordedAt: nowIso,
        source: 'snapshot',
      });
    }
  }

  save();
  res.json({ ok: true, received: normalized.count });
});

// 前端读取最新快照（在线状态按权威规则合并：采集器新鲜用 ICMP，否则 NAS 探测兜底）
app.get('/api/router/realtime', auth.requireAuth, (req, res) => {
  const snap = db.routerRealtime
    ? JSON.parse(JSON.stringify(db.routerRealtime))
    : null;
  if (snap && Array.isArray(snap.devices)) {
    for (const d of snap.devices) {
      if (!d || !d.addr) continue;
      d.status = effectiveStatus(d.addr, d.status);
    }
    snap.probeAt = probeLatest.ts;
    snap.probeOnline = probeLatest.online;
  }
  res.json({
    snapshot: snap,
    history: realtimeHistory || [],
    probe: probeLatest,
  });
});

// ---------- 消息下发（平台 → 采集器 → 目标 PC 弹窗） ----------
// PC 特征判定：笔记本/台式机类型，或主机名含 DESKTOP/PC/ADMIN
function isPcDevice(dev) {
  const t = String(dev.deviceType || '');
  const h = String(dev.hostname || '').toUpperCase();
  if (t === '笔记本' || t === '台式机') return true;
  return /DESKTOP|PC|ADMIN|NOTEBOOK|LAPTOP/.test(h);
}

// 计算群发目标：在线 PC（排除 NAS 豁免设备）
function pcTargets() {
  return db.devices
    .filter((d) => d.status === 'online' && !d.exempt && isPcDevice(d))
    .map((d) => d.ip);
}

// 发送消息（前端，登录后）
app.post('/api/message/send', auth.requireAuth, (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: '消息内容不能为空' });
  const mode = req.body.mode === 'custom' ? 'custom' : 'all';
  let targets;
  if (mode === 'custom') {
    targets = (Array.isArray(req.body.ips) ? req.body.ips : []).filter((x) => typeof x === 'string' && x);
  } else {
    targets = pcTargets();
  }
  if (!targets.length) return res.status(400).json({ error: '没有可发送的在线 PC 目标' });
  const msg = {
    id: store.nextId(),
    content,
    mode,
    targets,
    status: 'pending', // pending → delivering → done
    delivered: [], // 已弹窗回报的 IP（防重复弹窗）
    results: [],
    createdAt: new Date().toISOString(),
    createdBy: req.user && req.user.username ? req.user.username : 'admin',
  };
  db.messages.push(msg);
  save();
  res.json({ ok: true, message: msg });
});

// 各 PC 消息接收端轮询：按本机 IP 取属于自己的消息（不抢单、不重复弹窗）
app.get('/api/message/pending', collectorAuth, (req, res) => {
  const ip = String(req.query.ip || '').trim();
  if (!ip) return res.status(400).json({ error: '缺少 ip 参数' });
  const msg = db.messages.find(
    (m) =>
      (m.status === 'pending' || m.status === 'delivering') &&
      m.targets.includes(ip) &&
      !(m.delivered || []).includes(ip),
  );
  if (!msg) return res.json({ ok: true, message: null });
  if (msg.status === 'pending') {
    msg.status = 'delivering';
    save();
  }
  res.json({ ok: true, message: msg });
});

// 各 PC 回报弹窗结果（按 ip 累加，全部送达后消息完成）
app.post('/api/message/result', collectorAuth, (req, res) => {
  const id = String(req.body.messageId || '');
  const ip = String(req.body.ip || '');
  const msg = db.messages.find((m) => m.id === id);
  if (!msg) return res.status(404).json({ error: '消息不存在' });
  msg.delivered = msg.delivered || [];
  if (!msg.delivered.includes(ip)) msg.delivered.push(ip);
  msg.results = msg.results || [];
  msg.results = msg.results.filter((r) => r.ip !== ip);
  msg.results.push({ ip, ok: !!req.body.ok, error: req.body.error || null, at: new Date().toISOString() });
  const allDone = msg.targets.every((t) => msg.delivered.includes(t));
  if (allDone) {
    msg.status = 'done';
    msg.doneAt = new Date().toISOString();
  }
  save();
  res.json({ ok: true });
});

// 前端查看发送历史（含结果）
app.get('/api/messages', auth.requireAuth, (req, res) => {
  const list = (db.messages || []).slice(-20).reverse();
  res.json({ items: list });
});

// ---------- 即时抓取触发（前端刷新 → NAS 采集器立即抓一次路由器） ----------
let collectTriggeredAt = 0;

app.post('/api/collect/trigger', auth.requireAuth, (req, res) => {
  if (db.collectorEnabled === false) {
    return res.json({ ok: true, ignored: true, reason: '抓取总开关已关闭' });
  }
  collectTriggeredAt = Date.now();
  res.json({ ok: true, triggeredAt: collectTriggeredAt });
});

app.get('/api/collect/pending', collectorAuth, (req, res) => {
  const ts = collectTriggeredAt;
  if (ts > 0) collectTriggeredAt = 0; // 采集器拉取一次即清标志
  res.json({ ok: true, triggered: ts > 0, triggeredAt: ts, enabled: db.collectorEnabled !== false });
});

// 采集器查询总开关状态（每轮循环使用）
app.get('/api/collect/agent-status', collectorAuth, (req, res) => {
  res.json({ ok: true, enabled: db.collectorEnabled !== false });
});

// 前端读取总开关状态
app.get('/api/collect/status', auth.requireAuth, (req, res) => {
  res.json({ ok: true, enabled: db.collectorEnabled !== false, resetAt: db.resetAt || null });
});

// 前端切换总开关（开/关）
app.post('/api/collect/toggle', auth.requireAuth, (req, res) => {
  db.collectorEnabled = !!req.body.enabled;
  if (db.collectorEnabled) db.resetAt = db.resetAt || null; // 重新开启不重置历史
  save();
  res.json({ ok: true, enabled: db.collectorEnabled });
});

// 重置：清空设备台账与流量数据，重新开始（保留账号/路由凭据/消息历史）
// 重置同时自动关闭抓取总开关：避免刚清空又被采集器自动重新填满，用户准备就绪后再手动开启
app.post('/api/collect/reset', auth.requireAuth, auth.requireAdmin, (req, res) => {
  db.devices = [];
  db.trafficRecords = [];
  db.routerRealtime = null;
  realtimeHistory = null; // 内存快照历史同步清空
  db.collectorEnabled = false;
  db.resetAt = new Date().toISOString();
  save();
  res.json({ ok: true, resetAt: db.resetAt, enabled: false });
});


let realtimeHistory = null;

app.listen(PORT, () => {
  console.log(`lan-device-manager server listening on ${PORT}`);
});
