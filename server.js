const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const rateLimit = require("express-rate-limit");
const app = express();
app.use(cors());
app.use(express.json());

let users = {};
let rechargeRequests = [];
let withdrawRequests = [];
let spinRecords = [];

const DEFAULT_REWARDS = [
  { type: "iphone", name: "iPhone 17", value: 1, weight: 0.01, rarity: "legendary", icon: "📱", segment: 0 },
  { type: "airpods", name: "AirPods", value: 1, weight: 0.1, rarity: "legendary", icon: "🎧", segment: 1 },
  { type: "cash", name: "1000K盾", value: 1000000, weight: 1, rarity: "epic", icon: "💰", segment: 2 },
  { type: "cash", name: "50K盾", value: 50000, weight: 5, rarity: "epic", icon: "💵", segment: 3 },
  { type: "points", name: "200K积分", value: 200000, weight: 10, rarity: "rare", icon: "⭐", segment: 4 },
  { type: "points", name: "50K积分", value: 50000, weight: 15, rarity: "rare", icon: "✨", segment: 5 },
  { type: "points", name: "10K积分", value: 10000, weight: 50, rarity: "common", icon: "🎫", segment: 6 },
  { type: "points", name: "1K积分", value: 1000, weight: 30, rarity: "common", icon: "🎟️", segment: 7 }
];

const SPIN_COST = 30000;

// ----- Admin data stores -----
let admins = {
  admin: {
    password: "admin123",
    role: "super",
    status: "active",
    displayName: "超级管理员",
    createdAt: new Date()
  }
};
let adminApplications = [];
let adminSessions = {}; // token -> adminId
let frozenUsers = {};   // userId -> { frozenAt, frozenBy }
let paymentAccounts = [];
let gameConfig = {
  rewards: DEFAULT_REWARDS.map(r => ({ ...r })),
  description: "欢迎来到幸运转盘！每次旋转消耗30,000积分，有机会赢得iPhone 17、AirPods等大奖！",
  spinCost: SPIN_COST
};

// ----- Helper -----
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getTotalWeight(rewards) {
  return rewards.reduce((sum, r) => sum + r.weight, 0);
}

function selectRewardFromConfig() {
  const rewards = gameConfig.rewards;
  const total = getTotalWeight(rewards);
  let random = Math.random() * total;
  for (const reward of rewards) {
    random -= reward.weight;
    if (random <= 0) return reward;
  }
  return rewards[rewards.length - 1];
}

// Legacy helper kept for backward compatibility
function selectReward() {
  return selectRewardFromConfig();
}

// ----- Admin auth middleware -----
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token || !adminSessions[token]) {
    return res.status(401).json({ error: "请先登录管理后台" });
  }
  const adminId = adminSessions[token];
  const admin = admins[adminId];
  if (!admin || admin.status !== "active") {
    delete adminSessions[token];
    return res.status(401).json({ error: "账号已被禁用" });
  }
  req.adminId = adminId;
  req.admin = admin;
  next();
}

function requireSuperAdmin(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin.role !== "super") {
      return res.status(403).json({ error: "需要超级管理员权限" });
    }
    next();
  });
}

// ============================================================
// Admin API routes  (prefix: /api/admin)
// ============================================================

// POST /api/admin/login
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: "请输入账号和密码" });
  const admin = admins[username];
  if (!admin || admin.password !== password) return res.json({ error: "账号或密码错误" });
  if (admin.status !== "active") return res.json({ error: "账号已被禁用，请联系超级管理员" });
  const token = generateToken();
  adminSessions[token] = username;
  res.json({ success: true, token, adminId: username, role: admin.role, displayName: admin.displayName || username });
});

// POST /api/admin/logout
app.post("/api/admin/logout", requireAdmin, (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (token) delete adminSessions[token];
  res.json({ success: true });
});

// POST /api/admin/apply  — anyone can apply to become an admin
app.post("/api/admin/apply", (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) return res.json({ error: "请输入账号和密码" });
  if (admins[username]) return res.json({ error: "该账号已存在，无需重复申请" });
  const existing = adminApplications.find(a => a.username === username && a.status === "pending");
  if (existing) return res.json({ error: "已有待审核的申请，请等待超级管理员审核" });
  adminApplications.push({
    id: Date.now(),
    username,
    password,
    displayName: displayName || username,
    status: "pending",
    createdAt: new Date(),
    reviewedAt: null,
    reviewedBy: null
  });
  res.json({ success: true, message: "申请已提交，请等待超级管理员审核" });
});

// GET /api/admin/me  — get current admin info
app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ adminId: req.adminId, role: req.admin.role, displayName: req.admin.displayName || req.adminId });
});

// ---- User Management ----

// GET /api/admin/users
app.get("/api/admin/users", requireAdmin, (req, res) => {
  const { search = "", page = 1, pageSize = 20 } = req.query;
  let list = Object.entries(users).map(([id, u]) => ({
    userId: id,
    phone: u.phone || "",
    points: u.points,
    cash: u.cash,
    spinCount: u.spinCount,
    totalWinnings: u.totalWinnings,
    frozen: !!frozenUsers[id],
    createdAt: u.createdAt
  }));
  if (search) {
    const kw = search.toLowerCase();
    list = list.filter(u => u.userId.toLowerCase().includes(kw) || u.phone.includes(kw));
  }
  const total = list.length;
  const start = (Number(page) - 1) * Number(pageSize);
  const items = list.slice(start, start + Number(pageSize));
  res.json({ total, page: Number(page), pageSize: Number(pageSize), items });
});

// DELETE /api/admin/users/:userId
app.delete("/api/admin/users/:userId", requireAdmin, (req, res) => {
  const { userId } = req.params;
  if (!users[userId]) return res.json({ error: "用户不存在" });
  delete users[userId];
  delete frozenUsers[userId];
  res.json({ success: true, message: `用户 ${userId} 已删除` });
});

// PATCH /api/admin/users/:userId/freeze
app.patch("/api/admin/users/:userId/freeze", requireAdmin, (req, res) => {
  const { userId } = req.params;
  if (!users[userId]) return res.json({ error: "用户不存在" });
  frozenUsers[userId] = { frozenAt: new Date(), frozenBy: req.adminId };
  res.json({ success: true, message: `用户 ${userId} 已冻结` });
});

// PATCH /api/admin/users/:userId/unfreeze
app.patch("/api/admin/users/:userId/unfreeze", requireAdmin, (req, res) => {
  const { userId } = req.params;
  if (!users[userId]) return res.json({ error: "用户不存在" });
  delete frozenUsers[userId];
  res.json({ success: true, message: `用户 ${userId} 已解冻` });
});

// PATCH /api/admin/users/:userId/reset-password
app.patch("/api/admin/users/:userId/reset-password", requireAdmin, (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;
  if (!users[userId]) return res.json({ error: "用户不存在" });
  if (!newPassword) return res.json({ error: "请提供新密码" });
  users[userId].password = newPassword;
  res.json({ success: true, message: `用户 ${userId} 密码已重置` });
});

// ---- Admin / Application Management (super admin only) ----

// GET /api/admin/applications
app.get("/api/admin/applications", requireSuperAdmin, (req, res) => {
  res.json({ total: adminApplications.length, items: adminApplications });
});

// PATCH /api/admin/applications/:appId/approve
app.patch("/api/admin/applications/:appId/approve", requireSuperAdmin, (req, res) => {
  const application = adminApplications.find(a => a.id === Number(req.params.appId));
  if (!application) return res.json({ error: "申请不存在" });
  if (application.status !== "pending") return res.json({ error: "该申请已处理" });
  admins[application.username] = {
    password: application.password,
    role: "admin",
    status: "active",
    displayName: application.displayName,
    createdAt: new Date()
  };
  application.status = "approved";
  application.reviewedAt = new Date();
  application.reviewedBy = req.adminId;
  res.json({ success: true, message: `已批准 ${application.username} 的申请` });
});

// PATCH /api/admin/applications/:appId/reject
app.patch("/api/admin/applications/:appId/reject", requireSuperAdmin, (req, res) => {
  const application = adminApplications.find(a => a.id === Number(req.params.appId));
  if (!application) return res.json({ error: "申请不存在" });
  if (application.status !== "pending") return res.json({ error: "该申请已处理" });
  application.status = "rejected";
  application.reviewedAt = new Date();
  application.reviewedBy = req.adminId;
  res.json({ success: true, message: `已拒绝 ${application.username} 的申请` });
});

// GET /api/admin/managers
app.get("/api/admin/managers", requireSuperAdmin, (req, res) => {
  const list = Object.entries(admins).map(([id, a]) => ({
    adminId: id,
    role: a.role,
    status: a.status,
    displayName: a.displayName || id,
    createdAt: a.createdAt
  }));
  res.json({ total: list.length, items: list });
});

// DELETE /api/admin/managers/:managerId
app.delete("/api/admin/managers/:managerId", requireSuperAdmin, (req, res) => {
  const { managerId } = req.params;
  if (!admins[managerId]) return res.json({ error: "管理员不存在" });
  if (managerId === req.adminId) return res.json({ error: "不能删除自己的账号" });
  if (admins[managerId].role === "super") return res.json({ error: "不能删除超级管理员账号" });
  delete admins[managerId];
  // Invalidate sessions for this admin
  for (const [token, id] of Object.entries(adminSessions)) {
    if (id === managerId) delete adminSessions[token];
  }
  res.json({ success: true, message: `管理员 ${managerId} 已删除` });
});

// PATCH /api/admin/managers/:managerId/reset-password
app.patch("/api/admin/managers/:managerId/reset-password", requireSuperAdmin, (req, res) => {
  const { managerId } = req.params;
  const { newPassword } = req.body;
  if (!admins[managerId]) return res.json({ error: "管理员不存在" });
  if (!newPassword) return res.json({ error: "请提供新密码" });
  admins[managerId].password = newPassword;
  res.json({ success: true, message: `管理员 ${managerId} 密码已重置` });
});

// ---- Game Config ----

// GET /api/admin/config
app.get("/api/admin/config", requireAdmin, (req, res) => {
  res.json(gameConfig);
});

// PUT /api/admin/config/rewards
app.put("/api/admin/config/rewards", requireAdmin, (req, res) => {
  const { rewards } = req.body;
  if (!Array.isArray(rewards) || rewards.length === 0) return res.json({ error: "奖品列表无效" });
  gameConfig.rewards = rewards;
  res.json({ success: true, message: "奖品配置已更新", rewards: gameConfig.rewards });
});

// PUT /api/admin/config/description
app.put("/api/admin/config/description", requireAdmin, (req, res) => {
  const { description } = req.body;
  if (!description) return res.json({ error: "请提供游戏说明" });
  gameConfig.description = description;
  res.json({ success: true, message: "游戏说明已更新" });
});

// ---- Stats ----

// GET /api/admin/stats/user/:userId/records
app.get("/api/admin/stats/user/:userId/records", requireAdmin, (req, res) => {
  const { userId } = req.params;
  const records = spinRecords.filter(r => r.userId === userId);
  res.json({ userId, total: records.length, records });
});

// GET /api/admin/stats/records
app.get("/api/admin/stats/records", requireAdmin, (req, res) => {
  const { page = 1, pageSize = 50 } = req.query;
  const total = spinRecords.length;
  const start = (Number(page) - 1) * Number(pageSize);
  const items = spinRecords.slice().reverse().slice(start, start + Number(pageSize));
  res.json({ total, page: Number(page), pageSize: Number(pageSize), items });
});

// GET /api/admin/stats/summary
app.get("/api/admin/stats/summary", requireAdmin, (req, res) => {
  const totalUsers = Object.keys(users).length;
  const frozenCount = Object.keys(frozenUsers).length;
  const totalSpins = spinRecords.length;
  const totalDeposits = rechargeRequests.filter(r => r.status === "approved").reduce((s, r) => s + r.amount, 0);
  const pendingDeposits = rechargeRequests.filter(r => r.status === "pending").length;
  const totalWithdrawals = withdrawRequests.filter(r => r.status === "approved").reduce((s, r) => s + r.amount, 0);
  // Win type breakdown
  const winBreakdown = {};
  for (const rec of spinRecords) {
    const key = rec.reward.name;
    if (!winBreakdown[key]) winBreakdown[key] = { count: 0, totalValue: 0 };
    winBreakdown[key].count++;
    winBreakdown[key].totalValue += rec.reward.value || 0;
  }
  res.json({
    totalUsers, frozenCount, totalSpins, totalDeposits, pendingDeposits,
    totalWithdrawals, winBreakdown,
    rechargeRequests: rechargeRequests.length,
    withdrawRequests: withdrawRequests.length
  });
});

// ---- Payment Accounts (super admin only) ----

// GET /api/admin/payment-accounts
app.get("/api/admin/payment-accounts", requireSuperAdmin, (req, res) => {
  res.json({ total: paymentAccounts.length, items: paymentAccounts });
});

// POST /api/admin/payment-accounts
app.post("/api/admin/payment-accounts", requireSuperAdmin, (req, res) => {
  const { type, name, account, bank } = req.body;
  if (!type || !name || !account) return res.json({ error: "请填写账号类型、名称和账号" });
  const entry = { id: Date.now(), type, name, account, bank: bank || "", createdAt: new Date(), createdBy: req.adminId };
  paymentAccounts.push(entry);
  res.json({ success: true, message: "收款账号已添加", account: entry });
});

// DELETE /api/admin/payment-accounts/:accountId
app.delete("/api/admin/payment-accounts/:accountId", requireSuperAdmin, (req, res) => {
  const idx = paymentAccounts.findIndex(a => a.id === Number(req.params.accountId));
  if (idx === -1) return res.json({ error: "账号不存在" });
  paymentAccounts.splice(idx, 1);
  res.json({ success: true, message: "收款账号已删除" });
});

app.post("/register", (req, res) => {
  const { userId, password, phone, bank } = req.body;
  if (!userId || userId.trim() === "") return res.json({ error: "请输入用户名" });
  if (users[userId]) {
    return res.json({
      username: userId,
      points: users[userId].points,
      cash: users[userId].cash,
      spinCount: users[userId].spinCount
    });
  }
  users[userId] = {
    password: password || "default",
    phone: phone || "",
    bank: bank || "",
    points: 100000,
    cash: 0,
    spinCount: 0,
    totalWinnings: 0,
    prizes: [],
    createdAt: new Date()
  };
  res.json({
    username: userId,
    points: users[userId].points,
    cash: users[userId].cash,
    spinCount: users[userId].spinCount
  });
});

app.get("/user/:id", (req, res) => {
  const user = users[req.params.id];
  if (!user) return res.json({ error: "用户不存在" });
  res.json({
    username: req.params.id,
    points: user.points,
    cash: user.cash,
    spinCount: user.spinCount,
    totalWinnings: user.totalWinnings,
    prizes: user.prizes
  });
});

app.post("/spin", (req, res) => {
  const { userId } = req.body;
  if (!userId || !users[userId]) return res.json({ error: "请先登录" });
  if (frozenUsers[userId]) return res.json({ error: "账号已被冻结，请联系管理员" });

  const user = users[userId];
  const spinCost = gameConfig.spinCost || SPIN_COST;
  if (user.points < spinCost) return res.json({ error: "积分不足" });

  user.points -= spinCost;
  user.spinCount += 1;
  const reward = selectRewardFromConfig();

  if (reward.type === "points") {
    user.points += reward.value;
  } else if (reward.type === "cash") {
    user.cash += reward.value;
  } else if (reward.type === "iphone" || reward.type === "airpods") {
    if (!user.prizes) user.prizes = [];
    user.prizes.push({ type: reward.type, name: reward.name, date: new Date() });
  }

  user.lastReward = reward;
  user.totalWinnings = (user.totalWinnings || 0) + (reward.value || 0);

  spinRecords.push({ userId, reward: { type: reward.type, name: reward.name, value: reward.value, rarity: reward.rarity, icon: reward.icon }, timestamp: new Date() });

  res.json({
    user: { username: userId, points: user.points, cash: user.cash, spinCount: user.spinCount },
    reward: { type: reward.type, name: reward.name, value: reward.value, rarity: reward.rarity, icon: reward.icon, segment: reward.segment }
  });
});

app.post("/recharge/request", (req, res) => {
  const { userId, amount, method } = req.body;
  if (!userId || !users[userId]) return res.json({ error: "请先登录" });
  if (!amount || amount < 10000) return res.json({ error: "最低充值 10,000 积分" });
  if (!method || !["momo", "bank", "zalo", "account_cash"].includes(method)) return res.json({ error: "充值方式不存在" });
  
  const request = {
    id: Date.now(),
    userId,
    amount,
    method,
    status: "pending",
    createdAt: new Date(),
    approvedAt: null,
    approvedBy: null
  };
  
  rechargeRequests.push(request);
  res.json({
    success: true,
    message: "✅ 充值申请已提交，请等待客服审核",
    requestId: request.id,
    amount: amount,
    method: method
  });
});

app.get("/recharge/requests", (req, res) => {
  const pendingRequests = rechargeRequests.filter(r => r.status === "pending");
  res.json({
    total: rechargeRequests.length,
    pending: pendingRequests.length,
    requests: rechargeRequests
  });
});

app.post("/recharge/approve", (req, res) => {
  const { requestId, adminPassword } = req.body;
  if (adminPassword !== "admin123") return res.json({ error: "管理员密码错误" });
  
  const request = rechargeRequests.find(r => r.id === requestId);
  if (!request) return res.json({ error: "充值申请不存在" });
  if (request.status !== "pending") return res.json({ error: "该申请已处理" });
  
  const user = users[request.userId];
  if (!user) return res.json({ error: "用户不存在" });
  
  user.points += request.amount;
  request.status = "approved";
  request.approvedAt = new Date();
  request.approvedBy = "admin";
  
  res.json({
    success: true,
    message: "✅ 充值已批准，用户已收到积分",
    userId: request.userId,
    amount: request.amount,
    userNewPoints: user.points
  });
});

app.post("/recharge/reject", (req, res) => {
  const { requestId, reason, adminPassword } = req.body;
  if (adminPassword !== "admin123") return res.json({ error: "管理员密码错误" });
  
  const request = rechargeRequests.find(r => r.id === requestId);
  if (!request) return res.json({ error: "充值申请不存在" });
  
  request.status = "rejected";
  request.rejectReason = reason || "管理员拒绝";
  request.approvedAt = new Date();
  
  res.json({
    success: true,
    message: "✅ 充值申请已拒绝",
    userId: request.userId,
    reason: request.rejectReason
  });
});

app.post("/recharge/direct", (req, res) => {
  const { userId, amount, adminPassword, reason } = req.body;
  if (adminPassword !== "admin123") return res.json({ error: "管理员密码错误" });
  if (!users[userId]) return res.json({ error: "用户不存在" });
  
  users[userId].points += amount;
  
  res.json({
    success: true,
    message: "✅ 已直接充值",
    userId: userId,
    amount: amount,
    userNewPoints: users[userId].points,
    reason: reason || "管理员充值"
  });
});

app.post("/recharge/account_cash", (req, res) => {
  const { userId, amount } = req.body;
  if (!userId || !users[userId]) return res.json({ error: "请先登录" });
  
  const user = users[userId];
  if (!amount || amount < 10000) return res.json({ error: "最低充值 10,000 积分" });
  
  const requiredCash = Math.ceil(amount / 100);
  if (user.cash < requiredCash) return res.json({ error: "账户现金不足。需要 " + requiredCash + " 越南盾，实际有 " + user.cash + " 越南盾" });
  
  user.cash -= requiredCash;
  user.points += amount;
  
  res.json({
    success: true,
    message: "✅ 已用账户现金充值",
    userId: userId,
    pointsAdded: amount,
    cashDeducted: requiredCash,
    user: {
      username: userId,
      points: user.points,
      cash: user.cash,
      spinCount: user.spinCount
    }
  });
});

app.get("/recharge/history/:userId", (req, res) => {
  const userRequests = rechargeRequests.filter(r => r.userId === req.params.userId);
  res.json({
    userId: req.params.userId,
    total: userRequests.length,
    history: userRequests
  });
});

const PORT = process.env.PORT || 3000;

// Rate limiter for static page routes (prevents DoS)
const pageRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too Many Requests"
});

// Serve admin login page for /admin and /admin/
app.get("/admin", pageRateLimit, (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "index.html"), err => {
    if (err) res.status(404).send("Admin page not found");
  });
});

// Serve admin sub-pages from the admin/ subdirectory only
app.use("/admin", express.static(path.join(__dirname, "admin")));

// Serve the main game pages explicitly (not the whole source root)
app.get(["/", "/index.html"], pageRateLimit, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"), err => {
    if (err) res.status(404).send("Not Found");
  });
});
app.get("/admin.html", pageRateLimit, (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"), err => {
    if (err) res.status(404).send("Not Found");
  });
});

app.listen(PORT, () => {
  console.log("\n🎉 ========================================");
  console.log("🎉 幸运转盘服务器启动成功！");
  console.log("🌐 访问地址: http://localhost:" + PORT);
  console.log("💰 充值接口已启用");
  console.log("📊 管理后台: http://localhost:" + PORT + "/admin/");
  console.log("🎉 ========================================\n");
});
