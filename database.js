/**
 * 🗄️ 数据库管理模块 (SQLite)
 * 提供所有数据持久化操作
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 数据库文件路径
const DB_PATH = path.join(__dirname, 'lucky-spin.db');
const BACKUP_DIR = path.join(__dirname, 'backups');

// 确保备份目录存在
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR);
}

// 初始化数据库连接
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // 性能优化

console.log('📦 数据库连接成功:', DB_PATH);

// ============= 创建表结构 =============

function initDatabase() {
  console.log('🔧 初始化数据库表...');

  // 1. 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      phone TEXT,
      bank TEXT,
      telegram TEXT,
      zalo TEXT,
      gender TEXT,
      points INTEGER DEFAULT 100000,
      cash INTEGER DEFAULT 0,
      spinCount INTEGER DEFAULT 0,
      totalWinnings INTEGER DEFAULT 0,
      freeSpinsRemaining INTEGER DEFAULT 0,
      isTemp INTEGER DEFAULT 0,
      inviteCode TEXT,
      invitedBy TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    )
  `);

  // 2. 抽奖记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS spin_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      rewardType TEXT NOT NULL,
      rewardName TEXT NOT NULL,
      rewardValue INTEGER NOT NULL,
      pointsSpent INTEGER NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(userId)
    )
  `);

  // 3. 充值申请表
  db.exec(`
    CREATE TABLE IF NOT EXISTS recharge_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      proofImage TEXT,
      note TEXT,
      reviewedBy TEXT,
      reviewedAt TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(userId)
    )
  `);

  // 4. 赠送记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS gift_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fromUserId TEXT NOT NULL,
      toUserId TEXT,
      amount INTEGER NOT NULL,
      message TEXT,
      contact TEXT,
      gender TEXT,
      type TEXT DEFAULT 'direct',
      status TEXT DEFAULT 'completed',
      matchedBy TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      completedAt TEXT,
      FOREIGN KEY (fromUserId) REFERENCES users(userId)
    )
  `);

  // 5. 管理员表
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      username TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      createdAt TEXT DEFAULT (datetime('now'))
    )
  `);

  // 6. 奖品配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS rewards_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      value INTEGER NOT NULL,
      weight REAL NOT NULL,
      rarity TEXT NOT NULL,
      icon TEXT NOT NULL,
      segment INTEGER NOT NULL,
      enabled INTEGER DEFAULT 1,
      updatedAt TEXT DEFAULT (datetime('now'))
    )
  `);

  // 7. 系统配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT DEFAULT (datetime('now'))
    )
  `);

  // 8. 支付账号表
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      accountName TEXT NOT NULL,
      accountNumber TEXT NOT NULL,
      qrCode TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now'))
    )
  `);

  // 创建索引优化查询
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_isTemp ON users(isTemp);
    CREATE INDEX IF NOT EXISTS idx_users_inviteCode ON users(inviteCode);
    CREATE INDEX IF NOT EXISTS idx_spin_records_userId ON spin_records(userId);
    CREATE INDEX IF NOT EXISTS idx_spin_records_createdAt ON spin_records(createdAt);
    CREATE INDEX IF NOT EXISTS idx_recharge_status ON recharge_requests(status);
    CREATE INDEX IF NOT EXISTS idx_gift_status ON gift_records(status);
  `);

  console.log('✅ 数据库表初始化完成');
}

// ============= 用户操作 =============

const UserDB = {
  // 创建用户
  create(userData) {
    const stmt = db.prepare(`
      INSERT INTO users (userId, password, phone, bank, telegram, zalo, gender, 
                        points, cash, spinCount, totalWinnings, freeSpinsRemaining, 
                        isTemp, inviteCode, invitedBy)
      VALUES (@userId, @password, @phone, @bank, @telegram, @zalo, @gender,
              @points, @cash, @spinCount, @totalWinnings, @freeSpinsRemaining,
              @isTemp, @inviteCode, @invitedBy)
    `);
    return stmt.run(userData);
  },

  // 查找用户
  findById(userId) {
    const stmt = db.prepare('SELECT * FROM users WHERE userId = ?');
    return stmt.get(userId);
  },

  // 更新用户
  update(userId, updates) {
    const fields = Object.keys(updates).map(key => `${key} = @${key}`).join(', ');
    const stmt = db.prepare(`
      UPDATE users SET ${fields}, updatedAt = datetime('now') WHERE userId = @userId
    `);
    return stmt.run({ userId, ...updates });
  },

  // 查找所有用户（分页）
  findAll(limit = 100, offset = 0) {
    const stmt = db.prepare(`
      SELECT * FROM users ORDER BY createdAt DESC LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
  },

  // 统计用户数
  count() {
    const stmt = db.prepare('SELECT COUNT(*) as total FROM users');
    return stmt.get().total;
  },

  // 删除临时用户
  deleteTemp(userId) {
    const stmt = db.prepare('DELETE FROM users WHERE userId = ? AND isTemp = 1');
    return stmt.run(userId);
  },

  // 查找临时用户
  findTemp() {
    const stmt = db.prepare('SELECT * FROM users WHERE isTemp = 1');
    return stmt.all();
  }
};

// ============= 抽奖记录操作 =============

const SpinDB = {
  // 添加记录
  create(record) {
    const stmt = db.prepare(`
      INSERT INTO spin_records (userId, rewardType, rewardName, rewardValue, pointsSpent)
      VALUES (@userId, @rewardType, @rewardName, @rewardValue, @pointsSpent)
    `);
    return stmt.run(record);
  },

  // 查询用户记录
  findByUser(userId, limit = 50) {
    const stmt = db.prepare(`
      SELECT * FROM spin_records WHERE userId = ? ORDER BY createdAt DESC LIMIT ?
    `);
    return stmt.all(userId, limit);
  },

  // 查询所有记录
  findAll(limit = 100, offset = 0) {
    const stmt = db.prepare(`
      SELECT s.*, u.userId as username FROM spin_records s
      LEFT JOIN users u ON s.userId = u.userId
      ORDER BY s.createdAt DESC LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
  },

  // 统计
  stats() {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as totalSpins,
        SUM(pointsSpent) as totalPointsSpent,
        SUM(rewardValue) as totalRewardsValue
      FROM spin_records
    `);
    return stmt.get();
  }
};

// ============= 充值申请操作 =============

const RechargeDB = {
  // 创建充值申请
  create(request) {
    const stmt = db.prepare(`
      INSERT INTO recharge_requests (userId, amount, proofImage, note)
      VALUES (@userId, @amount, @proofImage, @note)
    `);
    return stmt.run(request);
  },

  // 查找申请
  findById(id) {
    const stmt = db.prepare('SELECT * FROM recharge_requests WHERE id = ?');
    return stmt.get(id);
  },

  // 查找用户的申请
  findByUser(userId) {
    const stmt = db.prepare(`
      SELECT * FROM recharge_requests WHERE userId = ? ORDER BY createdAt DESC
    `);
    return stmt.all(userId);
  },

  // 查找待审核
  findPending() {
    const stmt = db.prepare(`
      SELECT r.*, u.userId as username, u.phone, u.bank 
      FROM recharge_requests r
      LEFT JOIN users u ON r.userId = u.userId
      WHERE r.status = 'pending'
      ORDER BY r.createdAt ASC
    `);
    return stmt.all();
  },

  // 更新状态
  updateStatus(id, status, reviewedBy) {
    const stmt = db.prepare(`
      UPDATE recharge_requests 
      SET status = ?, reviewedBy = ?, reviewedAt = datetime('now')
      WHERE id = ?
    `);
    return stmt.run(status, reviewedBy, id);
  },

  // 查找所有申请
  findAll(limit = 100, offset = 0) {
    const stmt = db.prepare(`
      SELECT r.*, u.userId as username FROM recharge_requests r
      LEFT JOIN users u ON r.userId = u.userId
      ORDER BY r.createdAt DESC LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
  }
};

// ============= 赠送记录操作 =============

const GiftDB = {
  // 创建赠送记录
  create(gift) {
    const stmt = db.prepare(`
      INSERT INTO gift_records (fromUserId, toUserId, amount, message, contact, 
                               gender, type, status)
      VALUES (@fromUserId, @toUserId, @amount, @message, @contact, 
              @gender, @type, @status)
    `);
    const result = stmt.run(gift);
    return result.lastInsertRowid;
  },

  // 查找记录
  findById(id) {
    const stmt = db.prepare('SELECT * FROM gift_records WHERE id = ?');
    return stmt.get(id);
  },

  // 查找待匹配
  findPending() {
    const stmt = db.prepare(`
      SELECT * FROM gift_records WHERE status = 'pending' ORDER BY createdAt ASC
    `);
    return stmt.all();
  },

  // 更新状态
  updateStatus(id, toUserId, matchedBy) {
    const stmt = db.prepare(`
      UPDATE gift_records 
      SET toUserId = ?, status = 'completed', matchedBy = ?, 
          completedAt = datetime('now')
      WHERE id = ?
    `);
    return stmt.run(toUserId, matchedBy, id);
  },

  // 查找所有记录
  findAll(limit = 100, offset = 0) {
    const stmt = db.prepare(`
      SELECT * FROM gift_records ORDER BY createdAt DESC LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
  },

  // 统计
  stats() {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(amount) as totalAmount
      FROM gift_records
    `);
    return stmt.get();
  }
};

// ============= 管理员操作 =============

const AdminDB = {
  // 创建管理员
  create(admin) {
    const stmt = db.prepare(`
      INSERT INTO admins (username, password, role)
      VALUES (@username, @password, @role)
    `);
    return stmt.run(admin);
  },

  // 查找管理员
  findByUsername(username) {
    const stmt = db.prepare('SELECT * FROM admins WHERE username = ?');
    return stmt.get(username);
  },

  // 查找所有管理员
  findAll() {
    const stmt = db.prepare('SELECT * FROM admins ORDER BY createdAt DESC');
    return stmt.all();
  },

  // 更新密码
  updatePassword(username, password) {
    const stmt = db.prepare('UPDATE admins SET password = ? WHERE username = ?');
    return stmt.run(password, username);
  },

  // 删除管理员
  delete(username) {
    const stmt = db.prepare('DELETE FROM admins WHERE username = ?');
    return stmt.run(username);
  }
};

// ============= 奖品配置操作 =============

const RewardsDB = {
  // 初始化默认奖品
  initDefaults(rewards) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO rewards_config (id, type, name, value, weight, rarity, icon, segment)
      VALUES (@id, @type, @name, @value, @weight, @rarity, @icon, @segment)
    `);
    
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        stmt.run(item);
      }
    });
    
    insertMany(rewards);
  },

  // 查找所有奖品
  findAll() {
    const stmt = db.prepare('SELECT * FROM rewards_config WHERE enabled = 1 ORDER BY segment');
    return stmt.all();
  },

  // 更新奖品
  update(id, updates) {
    const fields = Object.keys(updates).map(key => `${key} = @${key}`).join(', ');
    const stmt = db.prepare(`
      UPDATE rewards_config SET ${fields}, updatedAt = datetime('now') WHERE id = @id
    `);
    return stmt.run({ id, ...updates });
  }
};

// ============= 系统配置操作 =============

const ConfigDB = {
  // 设置配置
  set(key, value) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO system_config (key, value, updatedAt)
      VALUES (?, ?, datetime('now'))
    `);
    return stmt.run(key, JSON.stringify(value));
  },

  // 获取配置
  get(key) {
    const stmt = db.prepare('SELECT value FROM system_config WHERE key = ?');
    const result = stmt.get(key);
    return result ? JSON.parse(result.value) : null;
  },

  // 获取所有配置
  getAll() {
    const stmt = db.prepare('SELECT * FROM system_config');
    const rows = stmt.all();
    const config = {};
    rows.forEach(row => {
      config[row.key] = JSON.parse(row.value);
    });
    return config;
  }
};

// ============= 支付账号操作 =============

const PaymentDB = {
  // 创建账号
  create(account) {
    const stmt = db.prepare(`
      INSERT INTO payment_accounts (type, accountName, accountNumber, qrCode, isActive)
      VALUES (@type, @accountName, @accountNumber, @qrCode, @isActive)
    `);
    return stmt.run(account);
  },

  // 查找所有账号
  findAll() {
    const stmt = db.prepare('SELECT * FROM payment_accounts ORDER BY createdAt DESC');
    return stmt.all();
  },

  // 查找激活的账号
  findActive() {
    const stmt = db.prepare('SELECT * FROM payment_accounts WHERE isActive = 1');
    return stmt.all();
  },

  // 删除账号
  delete(id) {
    const stmt = db.prepare('DELETE FROM payment_accounts WHERE id = ?');
    return stmt.run(id);
  }
};

// ============= 数据库备份 =============

function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const backupPath = path.join(BACKUP_DIR, `lucky-spin-${timestamp}.db`);
  
  try {
    fs.copyFileSync(DB_PATH, backupPath);
    console.log('✅ 数据库备份成功:', backupPath);
    return backupPath;
  } catch (error) {
    console.error('❌ 数据库备份失败:', error.message);
    return null;
  }
}

// 自动备份（每天一次）
function setupAutoBackup() {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  
  setInterval(() => {
    backupDatabase();
  }, ONE_DAY);
  
  console.log('⏰ 自动备份已启用（每24小时一次）');
}

// ============= 数据统计 =============

function getDashboardStats() {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalSpins = db.prepare('SELECT COUNT(*) as count FROM spin_records').get().count;
  const pendingRecharges = db.prepare("SELECT COUNT(*) as count FROM recharge_requests WHERE status = 'pending'").get().count;
  const totalGifts = db.prepare('SELECT COUNT(*) as count FROM gift_records').get().count;
  
  return {
    totalUsers,
    totalSpins,
    pendingRecharges,
    totalGifts
  };
}

// ============= 导出模块 =============

module.exports = {
  db,
  initDatabase,
  backupDatabase,
  setupAutoBackup,
  getDashboardStats,
  UserDB,
  SpinDB,
  RechargeDB,
  GiftDB,
  AdminDB,
  RewardsDB,
  ConfigDB,
  PaymentDB
};
