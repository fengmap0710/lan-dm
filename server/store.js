// JSON 文件存储（低并发内网场景）：启动加载一次到内存，写操作同步落盘（临时文件+rename 原子替换）
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.txt');

const EMPTY_DB = {
  seq: 1,
  users: [],
  devices: [],
  rules: [],
  policies: [],
  routerCredential: null,
  trafficRecords: [],
  routerRealtime: null,
  messages: [],
  collectorEnabled: true, // 抓取总开关（false = 停止一切抓取）
  resetAt: null,
};

let db = null;
let secret = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
      console.error('db.json 解析失败，使用空库：', e.message);
      db = JSON.parse(JSON.stringify(EMPTY_DB));
    }
  } else {
    db = JSON.parse(JSON.stringify(EMPTY_DB));
  }
  if (!db.seq) db.seq = 1;
  for (const k of Object.keys(EMPTY_DB)) {
    if (db[k] === undefined) db[k] = JSON.parse(JSON.stringify(EMPTY_DB[k]));
  }
  // 加载/生成签名密钥
  if (fs.existsSync(SECRET_FILE)) {
    secret = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
  } else {
    secret = require('crypto').randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, secret, 'utf-8');
  }
}

function save() {
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmp, DB_FILE);
}

function nextId() {
  const id = String(db.seq);
  db.seq += 1;
  return id;
}

module.exports = {
  load,
  save,
  get db() { return db; },
  nextId,
  getSecret: () => secret,
  DB_FILE,
};
