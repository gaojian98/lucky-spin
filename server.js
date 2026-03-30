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

const REWARDS = [
  { type: "iphone", name: "iPhone 17", value: 1, weight: 0.01, rarity: "legendary", icon: "📱", segment: 0 },
  { type: "airpods", name: "AirPods", value: 1, weight: 0.1, rarity: "legendary", icon: "🎧", segment: 1 },
  { type: "cash", name: "1000K盾", value: 1000000, weight: 1, rarity: "epic", icon: "💰", segment: 2 },
  { type: "cash", name: "50K盾", value: 50000, weight: 5, rarity: "epic", icon: "💵", segment: 3 },
  { type: "points", name: "200K积分", value: 200000, weight: 10, rarity: "rare", icon: "⭐", segment: 4 },
  { type: "points", name: "50K积分", value: 50000, weight: 15, rarity: "rare", icon: "✨", segment: 5 },
  { type: "points", name: "10K积分", value: 10000, weight: 50, rarity: "common", icon: "🎫", segment: 6 },
  { type: "points", name: "1K积分", value: 1000, weight: 30, rarity: "common", icon: "🎟️", segment: 7 }
];

let rewardsConfig = REWARDS.map((r, i) => ({ ...r, id: i + 1 }));
let gameDescription = "欢迎来到幸运转盘！每次转盘消耗30,000积分，赢取丰厚奖励！祝您好运！";
let winRecords = [];
let winRecordIdCounter = 1;
let managerApplications = [];
let applicationIdCounter = 1;
let paymentAccounts = [];
let paymentAccountIdCounter = 1;

const SPIN_COST = 30000;

function getTotalWeight() {
  return rewardsConfig.reduce((sum, r) => sum + r.weight, 0);
}

function selectReward() {
  const totalWeight = getTotalWeight();
  let random = Math.random() * totalWeight;
  for (let reward of rewardsConfig) {
    random -= reward.weight;
    if (random <= 0) return reward;
  }
  return rewardsConfig[rewardsConfig.length - 1];
}

// 管理员会话管理
const adminSessions = {}; // token -> { username, role }

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !adminSessions[token]) {
    return res.status(401).json({ error: '请先登录管理后台' });
  }
  req.admin = adminSessions[token];
  next();
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
  
  const user = users[userId];
  if (user.points < SPIN_COST) return res.json({ error: "积分不足" });
  
  user.points -= SPIN_COST;
  user.spinCount += 1;
  const reward = selectReward();
  
  if (reward.type === "points") {
    user.points += reward.value;
    user.totalWinnings += reward.value;
  } else if (reward.type === "cash") {
    user.cash += reward.value;
    user.totalWinnings += reward.value;
  } else if (reward.type === "iphone" || reward.type === "airpods") {
    if (!user.prizes) user.prizes = [];
    user.prizes.push({ type: reward.type, name: reward.name, date: new Date() });
  }
  
  winRecords.push({
    id: winRecordIdCounter++,
    userId,
    reward: { type: reward.type, name: reward.name, value: reward.value, icon: reward.icon },
    timestamp: new Date()
  });

  user.lastReward = reward;
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
  
  const requiredCash = Math.ceil(amount / 1);
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

// 管理员账号（初始超级管理员）
const ADMIN_ACCOUNTS = {
  admin: { password: "admin123", role: "super" }
};

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: "请输入账号和密码" });
  const account = ADMIN_ACCOUNTS[username];
  if (!account || account.password !== password) return res.json({ error: "账号或密码错误" });
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions[token] = { username, role: account.role };
  res.json({ username, role: account.role, token });
});

// 申请成为管理员
app.post("/api/admin/apply", (req, res) => {
  const { username, password, reason } = req.body;
  if (!username || !password) return res.json({ error: "请输入用户名和密码" });
  const existing = managerApplications.find(a => a.username === username && a.status === 'pending');
  if (existing) return res.json({ error: "您已有一个待审核的申请" });
  const application = {
    id: applicationIdCounter++,
    username,
    password,
    reason: reason || "",
    status: "pending",
    createdAt: new Date(),
    processedAt: null,
    processedBy: null
  };
  managerApplications.push(application);
  res.json({ success: true, message: "申请已提交，请等待超级管理员审核", applicationId: application.id });
});

// 查询申请状态
app.get("/api/admin/apply/status", (req, res) => {
  const { username } = req.query;
  if (!username) return res.json({ error: "请提供用户名" });
  const application = managerApplications.filter(a => a.username === username).slice(-1)[0];
  if (!application) return res.json({ status: "none", message: "暂无申请记录" });
  const msgs = { pending: "审核中，请耐心等待", approved: "申请已通过，请登录", rejected: "申请已拒绝" };
  res.json({ status: application.status, message: msgs[application.status] || application.status, createdAt: application.createdAt });
});

// 获取管理员申请列表（需要管理员权限）
app.get("/api/admin/applications", requireAdmin, (req, res) => {
  res.json({ applications: managerApplications });
});

// 批准申请
app.patch("/api/admin/applications/:id/approve", requireAdmin, (req, res) => {
  const app_item = managerApplications.find(a => a.id === parseInt(req.params.id));
  if (!app_item) return res.json({ error: "申请不存在" });
  if (app_item.status !== 'pending') return res.json({ error: "该申请已处理" });
  app_item.status = 'approved';
  app_item.processedAt = new Date();
  app_item.processedBy = req.admin.username;
  ADMIN_ACCOUNTS[app_item.username] = { password: app_item.password, role: 'manager' };
  res.json({ success: true, message: "申请已批准，管理员账号已创建" });
});

// 拒绝申请
app.patch("/api/admin/applications/:id/reject", requireAdmin, (req, res) => {
  const app_item = managerApplications.find(a => a.id === parseInt(req.params.id));
  if (!app_item) return res.json({ error: "申请不存在" });
  if (app_item.status !== 'pending') return res.json({ error: "该申请已处理" });
  app_item.status = 'rejected';
  app_item.processedAt = new Date();
  app_item.processedBy = req.admin.username;
  res.json({ success: true, message: "申请已拒绝" });
});

// 获取管理员列表
app.get("/api/admin/managers", requireAdmin, (req, res) => {
  const list = Object.entries(ADMIN_ACCOUNTS).map(([username, info]) => ({
    username,
    role: info.role,
    createdAt: info.createdAt || null
  }));
  res.json({ managers: list });
});

// 删除管理员
app.delete("/api/admin/managers/:id", requireAdmin, (req, res) => {
  const username = req.params.id;
  if (username === 'admin') return res.json({ error: "不能删除超级管理员" });
  if (!ADMIN_ACCOUNTS[username]) return res.json({ error: "管理员不存在" });
  delete ADMIN_ACCOUNTS[username];
  Object.keys(adminSessions).forEach(token => {
    if (adminSessions[token].username === username) delete adminSessions[token];
  });
  res.json({ success: true, message: "管理员已删除" });
});

// 重置管理员密码
app.patch("/api/admin/managers/:id/reset-password", requireAdmin, (req, res) => {
  const username = req.params.id;
  if (!ADMIN_ACCOUNTS[username]) return res.json({ error: "管理员不存在" });
  const newPassword = req.body.newPassword || crypto.randomBytes(6).toString('hex');
  ADMIN_ACCOUNTS[username].password = newPassword;
  res.json({ success: true, message: "密码已重置", newPassword });
});

// 获取奖品配置
app.get("/api/admin/config/rewards", requireAdmin, (req, res) => {
  res.json({ rewards: rewardsConfig });
});

// 更新奖品配置
app.put("/api/admin/config/rewards", requireAdmin, (req, res) => {
  const { rewards } = req.body;
  if (!rewards || !Array.isArray(rewards)) return res.json({ error: "无效的奖品配置" });
  rewardsConfig = rewards;
  res.json({ success: true, message: "奖品配置已更新" });
});

// 获取游戏说明
app.get("/api/admin/config/description", requireAdmin, (req, res) => {
  res.json({ description: gameDescription });
});

// 更新游戏说明
app.put("/api/admin/config/description", requireAdmin, (req, res) => {
  const { description } = req.body;
  if (!description) return res.json({ error: "说明内容不能为空" });
  gameDescription = description;
  res.json({ success: true, message: "游戏说明已更新" });
});

// 统计摘要
app.get("/api/admin/stats/summary", requireAdmin, (req, res) => {
  const totalUsers = Object.keys(users).length;
  const totalSpins = Object.values(users).reduce((sum, u) => sum + (u.spinCount || 0), 0);
  const totalWinnings = Object.values(users).reduce((sum, u) => sum + (u.totalWinnings || 0), 0);
  const totalRecharge = rechargeRequests.filter(r => r.status === 'approved').reduce((sum, r) => sum + r.amount, 0);
  const totalCash = Object.values(users).reduce((sum, u) => sum + (u.cash || 0), 0);
  res.json({
    totalUsers,
    totalSpins,
    totalWinnings,
    totalRecharge,
    totalCash,
    totalWinRecords: winRecords.length,
    pendingRecharge: rechargeRequests.filter(r => r.status === 'pending').length
  });
});

// 获取中奖记录
app.get("/api/admin/stats/records", requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const sorted = [...winRecords].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const total = sorted.length;
  const records = sorted.slice((page - 1) * limit, page * limit);
  res.json({ total, page, limit, records });
});

// 获取用户中奖记录
app.get("/api/admin/stats/user/:userId/records", requireAdmin, (req, res) => {
  const userRecords = winRecords.filter(r => r.userId === req.params.userId);
  res.json({ userId: req.params.userId, total: userRecords.length, records: userRecords });
});

// 获取收款账号列表
app.get("/api/admin/payment-accounts", requireAdmin, (req, res) => {
  res.json({ accounts: paymentAccounts });
});

// 添加收款账号
app.post("/api/admin/payment-accounts", requireAdmin, (req, res) => {
  const { name, bank, account, holder } = req.body;
  if (!name || !bank || !account) return res.json({ error: "请填写账号名称、银行和账号" });
  const newAccount = { id: paymentAccountIdCounter++, name, bank, account, holder: holder || "", createdAt: new Date() };
  paymentAccounts.push(newAccount);
  res.json({ success: true, message: "收款账号已添加", account: newAccount });
});

// 删除收款账号
app.delete("/api/admin/payment-accounts/:id", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = paymentAccounts.findIndex(a => a.id === id);
  if (idx === -1) return res.json({ error: "账号不存在" });
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
