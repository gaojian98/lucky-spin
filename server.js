const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const app = express();
app.use(cors());
app.use(express.json());

// 管理后台静态文件服务（优先于根目录静态文件）
app.use('/admin', express.static(path.join(__dirname, 'admin')));

app.use(express.static(__dirname));

let users = {};
let rechargeRequests = [];

const SPIN_COST = 30000;

// Game configuration (modifiable by admins)
let gameConfig = {
  rewards: [
    { type: "iphone", name: "iPhone 17", value: 1, weight: 0.01, rarity: "legendary", icon: "📱", segment: 0 },
    { type: "airpods", name: "AirPods", value: 1, weight: 0.1, rarity: "legendary", icon: "🎧", segment: 1 },
    { type: "cash", name: "1000K盾", value: 1000000, weight: 1, rarity: "epic", icon: "💰", segment: 2 },
    { type: "cash", name: "50K盾", value: 50000, weight: 5, rarity: "epic", icon: "💵", segment: 3 },
    { type: "points", name: "200K积分", value: 200000, weight: 10, rarity: "rare", icon: "⭐", segment: 4 },
    { type: "points", name: "50K积分", value: 50000, weight: 15, rarity: "rare", icon: "✨", segment: 5 },
    { type: "points", name: "10K积分", value: 10000, weight: 50, rarity: "common", icon: "🎫", segment: 6 },
    { type: "points", name: "1K积分", value: 1000, weight: 30, rarity: "common", icon: "🎟️", segment: 7 }
  ],
  description: "每次转盘花费 30,000 积分，祝您好运！"
};

// Admin data stores
let adminUsers = {
  admin: { password: "admin123", role: "super", createdAt: new Date() }
};
let adminTokens = {}; // token -> { username, role }
let adminApplications = []; // pending admin applications
let winRecords = []; // all win records
let paymentAccounts = []; // payment accounts
let frozenUsers = new Set(); // frozen user IDs

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function generateId() {
  return crypto.randomBytes(8).toString("hex");
}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token || !adminTokens[token]) return res.status(401).json({ error: "未授权，请先登录" });
  const session = adminTokens[token];
  if (Date.now() - session.createdAt > TOKEN_TTL_MS) {
    delete adminTokens[token];
    return res.status(401).json({ error: "登录已过期，请重新登录" });
  }
  req.admin = session;
  next();
}

function requireSuperAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token || !adminTokens[token]) return res.status(401).json({ error: "未授权，请先登录" });
  const session = adminTokens[token];
  if (Date.now() - session.createdAt > TOKEN_TTL_MS) {
    delete adminTokens[token];
    return res.status(401).json({ error: "登录已过期，请重新登录" });
  }
  if (session.role !== "super") return res.status(403).json({ error: "需要超级管理员权限" });
  req.admin = session;
  next();
}

function selectReward() {
  const rewards = gameConfig.rewards;
  const totalWeight = rewards.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;
  for (let reward of rewards) {
    random -= reward.weight;
    if (random <= 0) return reward;
  }
  return rewards[rewards.length - 1];
}

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
  if (frozenUsers.has(userId)) return res.json({ error: "账号已被冻结，请联系管理员" });
  
  const user = users[userId];
  if (user.points < SPIN_COST) return res.json({ error: "积分不足" });
  
  user.points -= SPIN_COST;
  user.spinCount += 1;
  const reward = selectReward();
  
  if (reward.type === "points") {
    user.points += reward.value;
  } else if (reward.type === "cash") {
    user.cash += reward.value;
  } else if (reward.type === "iphone" || reward.type === "airpods") {
    if (!user.prizes) user.prizes = [];
    user.prizes.push({ type: reward.type, name: reward.name, date: new Date() });
  }
  
  user.lastReward = reward;

  // Record win
  winRecords.push({
    id: generateId(),
    userId,
    reward: { type: reward.type, name: reward.name, value: reward.value, rarity: reward.rarity, icon: reward.icon },
    createdAt: new Date()
  });

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

// ==================== ADMIN AUTH APIS ====================

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: "请输入账号和密码" });
  const account = adminUsers[username];
  if (!account || account.password !== password) return res.json({ error: "账号或密码错误" });
  const token = generateToken();
  adminTokens[token] = { username, role: account.role, createdAt: Date.now() };
  res.json({ success: true, token, username, role: account.role });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  const token = req.headers["x-admin-token"];
  delete adminTokens[token];
  res.json({ success: true, message: "已登出" });
});

app.post("/api/admin/apply", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: "请输入账号和密码" });
  if (adminUsers[username]) return res.json({ error: "用户名已存在" });
  if (adminApplications.find(a => a.username === username && a.status === "pending")) {
    return res.json({ error: "已有待审核申请" });
  }
  const application = {
    id: generateId(),
    username,
    password,
    status: "pending",
    createdAt: new Date()
  };
  adminApplications.push(application);
  res.json({ success: true, message: "申请已提交，等待超级管理员审核", applicationId: application.id });
});

// ==================== USER MANAGEMENT APIS ====================

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const { search = "", page = 1, pageSize = 20 } = req.query;
  let userList = Object.entries(users).map(([id, u]) => ({
    userId: id,
    phone: u.phone,
    bank: u.bank,
    points: u.points,
    cash: u.cash,
    spinCount: u.spinCount,
    totalWinnings: u.totalWinnings,
    createdAt: u.createdAt,
    frozen: frozenUsers.has(id)
  }));
  if (search) {
    const s = search.toLowerCase();
    userList = userList.filter(u => u.userId.toLowerCase().includes(s) || (u.phone && u.phone.includes(s)));
  }
  const total = userList.length;
  const start = (parseInt(page) - 1) * parseInt(pageSize);
  const data = userList.slice(start, start + parseInt(pageSize));
  res.json({ total, page: parseInt(page), pageSize: parseInt(pageSize), data });
});

app.delete("/api/admin/users/:userId", requireAdmin, (req, res) => {
  const { userId } = req.params;
  if (!users[userId]) return res.json({ error: "用户不存在" });
  delete users[userId];
  frozenUsers.delete(userId);
  res.json({ success: true, message: "用户已删除" });
});

app.patch("/api/admin/users/:userId/freeze", requireAdmin, (req, res) => {
  const { userId } = req.params;
  if (!users[userId]) return res.json({ error: "用户不存在" });
  frozenUsers.add(userId);
  res.json({ success: true, message: "用户已冻结" });
});

app.patch("/api/admin/users/:userId/unfreeze", requireAdmin, (req, res) => {
  const { userId } = req.params;
  if (!users[userId]) return res.json({ error: "用户不存在" });
  frozenUsers.delete(userId);
  res.json({ success: true, message: "用户已解冻" });
});

app.patch("/api/admin/users/:userId/reset-password", requireAdmin, (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;
  if (!users[userId]) return res.json({ error: "用户不存在" });
  if (!newPassword) return res.json({ error: "请输入新密码" });
  users[userId].password = newPassword;
  res.json({ success: true, message: "密码已重置" });
});

app.get("/api/admin/users/:userId/records", requireAdmin, (req, res) => {
  const { userId } = req.params;
  const records = winRecords.filter(r => r.userId === userId);
  res.json({ userId, total: records.length, records });
});

// ==================== ADMIN MANAGEMENT APIS (SUPER ADMIN ONLY) ====================

app.get("/api/admin/applications", requireSuperAdmin, (req, res) => {
  res.json({ total: adminApplications.length, applications: adminApplications });
});

app.patch("/api/admin/applications/:appId/approve", requireSuperAdmin, (req, res) => {
  const { appId } = req.params;
  const application = adminApplications.find(a => a.id === appId);
  if (!application) return res.json({ error: "申请不存在" });
  if (application.status !== "pending") return res.json({ error: "该申请已处理" });
  if (adminUsers[application.username]) return res.json({ error: "用户名已存在" });
  application.status = "approved";
  application.approvedAt = new Date();
  application.approvedBy = req.admin.username;
  adminUsers[application.username] = { password: application.password, role: "manager", createdAt: new Date() };
  res.json({ success: true, message: "申请已批准", username: application.username });
});

app.patch("/api/admin/applications/:appId/reject", requireSuperAdmin, (req, res) => {
  const { appId } = req.params;
  const application = adminApplications.find(a => a.id === appId);
  if (!application) return res.json({ error: "申请不存在" });
  if (application.status !== "pending") return res.json({ error: "该申请已处理" });
  application.status = "rejected";
  application.rejectedAt = new Date();
  application.rejectedBy = req.admin.username;
  res.json({ success: true, message: "申请已拒绝" });
});

app.get("/api/admin/managers", requireSuperAdmin, (req, res) => {
  const managers = Object.entries(adminUsers).map(([username, u]) => ({
    username,
    role: u.role,
    createdAt: u.createdAt
  }));
  res.json({ total: managers.length, managers });
});

app.delete("/api/admin/managers/:managerId", requireSuperAdmin, (req, res) => {
  const { managerId } = req.params;
  if (!adminUsers[managerId]) return res.json({ error: "管理员不存在" });
  if (managerId === "admin") return res.json({ error: "不能删除超级管理员" });
  // Invalidate tokens for this manager
  for (const [token, info] of Object.entries(adminTokens)) {
    if (info.username === managerId) delete adminTokens[token];
  }
  delete adminUsers[managerId];
  res.json({ success: true, message: "管理员已删除" });
});

app.patch("/api/admin/managers/:managerId/reset-password", requireSuperAdmin, (req, res) => {
  const { managerId } = req.params;
  const { newPassword } = req.body;
  if (!adminUsers[managerId]) return res.json({ error: "管理员不存在" });
  if (!newPassword) return res.json({ error: "请输入新密码" });
  adminUsers[managerId].password = newPassword;
  res.json({ success: true, message: "管理员密码已重置" });
});

// ==================== GAME CONFIG APIS ====================

app.get("/api/admin/config", requireAdmin, (req, res) => {
  res.json({ config: gameConfig });
});

app.put("/api/admin/config/rewards", requireAdmin, (req, res) => {
  const { rewards } = req.body;
  if (!Array.isArray(rewards) || rewards.length === 0) return res.json({ error: "奖品列表无效" });
  for (const r of rewards) {
    if (!r.type || !r.name || r.weight == null || r.weight < 0 || r.value == null || !r.icon) {
      return res.json({ error: "奖品数据格式错误，缺少必填字段(type/name/weight/value/icon)" });
    }
  }
  gameConfig.rewards = rewards;
  res.json({ success: true, message: "奖品配置已更新", rewards: gameConfig.rewards });
});

app.put("/api/admin/config/description", requireAdmin, (req, res) => {
  const { description } = req.body;
  if (!description) return res.json({ error: "请输入游戏说明" });
  gameConfig.description = description;
  res.json({ success: true, message: "游戏说明已更新", description: gameConfig.description });
});

// ==================== STATISTICS APIS ====================

app.get("/api/admin/stats/summary", requireAdmin, (req, res) => {
  const totalUsers = Object.keys(users).length;
  const totalSpins = Object.values(users).reduce((sum, u) => sum + (u.spinCount || 0), 0);
  const totalWins = winRecords.length;
  const totalRecharge = rechargeRequests.filter(r => r.status === "approved").reduce((sum, r) => sum + r.amount, 0);
  const frozenCount = frozenUsers.size;
  res.json({ totalUsers, totalSpins, totalWins, totalRecharge, frozenCount });
});

app.get("/api/admin/stats/records", requireAdmin, (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const total = winRecords.length;
  const start = (parseInt(page) - 1) * parseInt(limit);
  const records = winRecords.slice(start, start + parseInt(limit));
  res.json({ total, page: parseInt(page), limit: parseInt(limit), records });
});

app.get("/api/admin/stats/user/:userId/records", requireAdmin, (req, res) => {
  const { userId } = req.params;
  const records = winRecords.filter(r => r.userId === userId);
  res.json({ userId, total: records.length, records });
});

app.get("/api/admin/stats/recharge-history", requireAdmin, (req, res) => {
  const approved = rechargeRequests.filter(r => r.status === "approved");
  const pending = rechargeRequests.filter(r => r.status === "pending");
  const rejected = rechargeRequests.filter(r => r.status === "rejected");
  const totalApprovedAmount = approved.reduce((sum, r) => sum + r.amount, 0);
  res.json({
    total: rechargeRequests.length,
    approved: approved.length,
    pending: pending.length,
    rejected: rejected.length,
    totalApprovedAmount,
    history: rechargeRequests
  });
});

// ==================== PAYMENT ACCOUNT APIS (SUPER ADMIN ONLY) ====================

app.post("/api/admin/payment-accounts", requireSuperAdmin, (req, res) => {
  const { type, accountName, accountNumber, bankName } = req.body;
  if (!type || !accountName || !accountNumber) return res.json({ error: "请填写完整的收款账号信息" });
  const account = {
    id: generateId(),
    type,
    accountName,
    accountNumber,
    bankName: bankName || "",
    createdAt: new Date(),
    createdBy: req.admin.username
  };
  paymentAccounts.push(account);
  res.json({ success: true, message: "收款账号已添加", account });
});

app.get("/api/admin/payment-accounts", requireSuperAdmin, (req, res) => {
  res.json({ total: paymentAccounts.length, accounts: paymentAccounts });
});

app.delete("/api/admin/payment-accounts/:accountId", requireSuperAdmin, (req, res) => {
  const { accountId } = req.params;
  const idx = paymentAccounts.findIndex(a => a.id === accountId);
  if (idx === -1) return res.json({ error: "收款账号不存在" });
  paymentAccounts.splice(idx, 1);
  res.json({ success: true, message: "收款账号已删除" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("\n🎉 ========================================");
  console.log("🎉 幸运转盘服务器启动成功！");
  console.log("🌐 访问地址: http://localhost:" + PORT);
  console.log("💰 充值接口已启用");
  console.log("📊 管理后台: http://localhost:" + PORT + "/admin");
  console.log("🎉 ========================================\n");
});
