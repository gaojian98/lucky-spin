const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();
app.use(cors());
app.use(express.json());

// 管理后台静态文件服务（优先于根目录静态文件）
app.use('/admin', express.static(path.join(__dirname, 'admin')));

app.use(express.static(__dirname));

let users = {};
let rechargeRequests = [];
let adminApplications = [];
let winRecords = [];
let paymentAccounts = [];
let gameDescription = "幸运转盘游戏规则：每次转盘消耗 30,000 积分，中奖奖品随机分配。祝您好运！";
let applicationCounter = 0;
let paymentAccountCounter = 0;

let REWARDS = [
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

function getTotalWeight() {
  return REWARDS.reduce((sum, r) => sum + r.weight, 0);
}

function selectReward() {
  let random = Math.random() * getTotalWeight();
  for (let reward of REWARDS) {
    random -= reward.weight;
    if (random <= 0) return reward;
  }
  return REWARDS[REWARDS.length - 1];
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
  } else if (reward.type === "cash") {
    user.cash += reward.value;
  } else if (reward.type === "iphone" || reward.type === "airpods") {
    if (!user.prizes) user.prizes = [];
    user.prizes.push({ type: reward.type, name: reward.name, date: new Date() });
  }
  
  user.lastReward = reward;

  winRecords.push({
    id: Date.now(),
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

// 管理员账号（初始超级管理员）
const ADMIN_ACCOUNTS = {
  admin: { password: "admin123", role: "super" }
};

function getAdminPassword(req) {
  return req.headers["x-admin-password"] || (req.body && req.body.adminPassword);
}

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: "请输入账号和密码" });
  const account = ADMIN_ACCOUNTS[username];
  if (!account || account.password !== password) return res.json({ error: "账号或密码错误" });
  res.json({ username, role: account.role });
});

// ── 管理员申请系统 ──────────────────────────────────────────────────────────

app.post("/api/admin/apply", (req, res) => {
  const { userId, reason } = req.body;
  if (!userId || !users[userId]) return res.json({ error: "用户不存在，请先登录" });
  const existing = adminApplications.find(a => a.userId === userId && a.status === "pending");
  if (existing) return res.json({ error: "您已有一个待审核的申请" });
  const application = {
    id: ++applicationCounter,
    userId,
    reason: reason || "",
    status: "pending",
    createdAt: new Date(),
    reviewedAt: null,
    reviewedBy: null
  };
  adminApplications.push(application);
  res.json({ success: true, message: "申请已提交，请等待审核", applicationId: application.id });
});

app.get("/api/admin/apply/status", (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.json({ error: "请提供用户ID" });
  const applications = adminApplications.filter(a => a.userId === userId);
  res.json({ userId, applications });
});

app.get("/api/admin/applications", (req, res) => {
  if (getAdminPassword(req) !== "admin123") return res.json({ error: "管理员密码错误" });
  res.json({ total: adminApplications.length, applications: adminApplications });
});

app.patch("/api/admin/applications/:id/approve", (req, res) => {
  const { adminPassword, adminUsername } = req.body;
  if (adminPassword !== "admin123") return res.json({ error: "管理员密码错误" });
  const id = parseInt(req.params.id, 10);
  const application = adminApplications.find(a => a.id === id);
  if (!application) return res.json({ error: "申请不存在" });
  if (application.status !== "pending") return res.json({ error: "该申请已处理" });
  application.status = "approved";
  application.reviewedAt = new Date();
  application.reviewedBy = adminUsername || "admin";
  const initialPassword = req.body.initialPassword || "admin123";
  ADMIN_ACCOUNTS[application.userId] = { password: initialPassword, role: "manager" };
  res.json({ success: true, message: "申请已批准，用户已成为管理员", userId: application.userId });
});

app.patch("/api/admin/applications/:id/reject", (req, res) => {
  const { adminPassword, adminUsername, reason } = req.body;
  if (adminPassword !== "admin123") return res.json({ error: "管理员密码错误" });
  const id = parseInt(req.params.id, 10);
  const application = adminApplications.find(a => a.id === id);
  if (!application) return res.json({ error: "申请不存在" });
  if (application.status !== "pending") return res.json({ error: "该申请已处理" });
  application.status = "rejected";
  application.reviewedAt = new Date();
  application.reviewedBy = adminUsername || "admin";
  application.rejectReason = reason || "管理员拒绝";
  res.json({ success: true, message: "申请已拒绝" });
});

// ── 管理员管理 ──────────────────────────────────────────────────────────────

app.get("/api/admin/managers", (req, res) => {
  if (getAdminPassword(req) !== "admin123") return res.json({ error: "管理员密码错误" });
  const managers = Object.entries(ADMIN_ACCOUNTS).map(([username, info]) => ({
    username,
    role: info.role
  }));
  res.json({ total: managers.length, managers });
});

app.delete("/api/admin/managers/:id", (req, res) => {
  const { adminPassword } = req.body;
  if (adminPassword !== "admin123") return res.json({ error: "管理员密码错误" });
  const username = req.params.id;
  if (!ADMIN_ACCOUNTS[username]) return res.json({ error: "管理员不存在" });
  if (ADMIN_ACCOUNTS[username].role === "super") return res.json({ error: "不能删除超级管理员" });
  delete ADMIN_ACCOUNTS[username];
  res.json({ success: true, message: "管理员已删除", username });
});

app.patch("/api/admin/managers/:id/reset-password", (req, res) => {
  const { adminPassword, newPassword } = req.body;
  if (adminPassword !== "admin123") return res.json({ error: "管理员密码错误" });
  const username = req.params.id;
  if (!ADMIN_ACCOUNTS[username]) return res.json({ error: "管理员不存在" });
  if (!newPassword || newPassword.length < 6) return res.json({ error: "新密码不能少于6位" });
  ADMIN_ACCOUNTS[username].password = newPassword;
  res.json({ success: true, message: "密码已重置", username });
});

// ── 奖品配置管理 ────────────────────────────────────────────────────────────

app.get("/api/admin/config/rewards", (req, res) => {
  res.json({ rewards: REWARDS });
});

app.put("/api/admin/config/rewards", (req, res) => {
  const { adminPassword, rewards } = req.body;
  if (adminPassword !== "admin123") return res.json({ error: "管理员密码错误" });
  if (!Array.isArray(rewards) || rewards.length === 0) return res.json({ error: "奖品配置不能为空" });
  REWARDS = rewards;
  res.json({ success: true, message: "奖品配置已更新", rewards: REWARDS });
});

// ── 游戏说明管理 ────────────────────────────────────────────────────────────

app.get("/api/admin/config/description", (req, res) => {
  res.json({ description: gameDescription });
});

app.put("/api/admin/config/description", (req, res) => {
  const { adminPassword, description } = req.body;
  if (adminPassword !== "admin123") return res.json({ error: "管理员密码错误" });
  if (!description) return res.json({ error: "游戏说明不能为空" });
  gameDescription = description;
  res.json({ success: true, message: "游戏说明已更新", description: gameDescription });
});

// ── 统计数据 API ────────────────────────────────────────────────────────────

app.get("/api/admin/stats/summary", (req, res) => {
  if (getAdminPassword(req) !== "admin123") return res.json({ error: "管理员密码错误" });
  const totalUsers = Object.keys(users).length;
  const totalSpins = Object.values(users).reduce((sum, u) => sum + (u.spinCount || 0), 0);
  const totalRecords = winRecords.length;
  const totalPoints = Object.values(users).reduce((sum, u) => sum + (u.points || 0), 0);
  res.json({ totalUsers, totalSpins, totalRecords, totalPoints });
});

app.get("/api/admin/stats/records", (req, res) => {
  if (getAdminPassword(req) !== "admin123") return res.json({ error: "管理员密码错误" });
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const start = (page - 1) * limit;
  const records = winRecords.slice(start, start + limit);
  res.json({ total: winRecords.length, page, limit, records });
});

app.get("/api/admin/stats/user/:userId/records", (req, res) => {
  if (getAdminPassword(req) !== "admin123") return res.json({ error: "管理员密码错误" });
  const { userId } = req.params;
  const records = winRecords.filter(r => r.userId === userId);
  res.json({ userId, total: records.length, records });
});

// ── 收款账号管理 ────────────────────────────────────────────────────────────

app.post("/api/admin/payment-accounts", (req, res) => {
  const { adminPassword, name, type, account, qrCode } = req.body;
  if (adminPassword !== "admin123") return res.json({ error: "管理员密码错误" });
  if (!name || !type || !account) return res.json({ error: "请填写完整的收款账号信息" });
  const entry = {
    id: ++paymentAccountCounter,
    name,
    type,
    account,
    qrCode: qrCode || "",
    createdAt: new Date()
  };
  paymentAccounts.push(entry);
  res.json({ success: true, message: "收款账号已添加", paymentAccount: entry });
});

app.get("/api/admin/payment-accounts", (req, res) => {
  if (getAdminPassword(req) !== "admin123") return res.json({ error: "管理员密码错误" });
  res.json({ total: paymentAccounts.length, paymentAccounts });
});

app.delete("/api/admin/payment-accounts/:id", (req, res) => {
  const { adminPassword } = req.body;
  if (adminPassword !== "admin123") return res.json({ error: "管理员密码错误" });
  const id = parseInt(req.params.id, 10);
  const index = paymentAccounts.findIndex(p => p.id === id);
  if (index === -1) return res.json({ error: "收款账号不存在" });
  paymentAccounts.splice(index, 1);
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
