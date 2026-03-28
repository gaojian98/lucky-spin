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

const TOTAL_WEIGHT = REWARDS.reduce((sum, r) => sum + r.weight, 0);
const SPIN_COST = 30000;

function selectReward() {
  let random = Math.random() * TOTAL_WEIGHT;
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
    id: winRecordIdCounter++,
    userId,
    rewardName: reward.name,
    rewardType: reward.type,
    rewardValue: reward.value,
    rewardIcon: reward.icon,
    rarity: reward.rarity,
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
  admin: { password: "admin123", role: "super", createdAt: new Date() }
};

// 管理员申请列表
let managerApplications = [];

// 中奖记录
let winRecords = [];

// 奖品配置（可编辑副本）
let rewardsConfig = REWARDS.map(r => Object.assign({}, r));

// 游戏说明
let gameDescription = "欢迎来到幸运转盘！每次转盘消耗 30,000 积分，有机会赢取 iPhone、现金及积分大奖。祝您好运！";

// 收款账号列表
let paymentAccounts = [];

// 自增ID计数器
let applicationIdCounter = 1;
let winRecordIdCounter = 1;
let paymentAccountIdCounter = 1;

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: "请输入账号和密码" });
  const account = ADMIN_ACCOUNTS[username];
  if (!account || account.password !== password) return res.json({ error: "账号或密码错误" });
  res.json({ username, role: account.role });
});

// 申请成为管理员
app.post("/api/admin/apply", (req, res) => {
  const { username, password, reason } = req.body;
  if (!username || !password) return res.json({ error: "请输入用户名和密码" });
  if (ADMIN_ACCOUNTS[username]) return res.json({ error: "该用户名已是管理员" });
  const existing = managerApplications.find(a => a.username === username && a.status === "pending");
  if (existing) return res.json({ error: "您已提交过申请，请等待审核" });
  const application = {
    id: applicationIdCounter++,
    username,
    password,
    reason: reason || "",
    status: "pending",
    createdAt: new Date()
  };
  managerApplications.push(application);
  res.json({ success: true, message: "✅ 申请已提交，请等待超级管理员审核", id: application.id });
});

// 查询申请状态
app.get("/api/admin/apply/status", (req, res) => {
  const { username } = req.query;
  if (!username) return res.json({ error: "请提供用户名" });
  const userApplications = managerApplications.filter(a => a.username === username);
  res.json({ applications: userApplications });
});

// 获取管理员申请列表（超级管理员）
app.get("/api/admin/applications", (req, res) => {
  res.json({ applications: managerApplications });
});

// 批准申请
app.patch("/api/admin/applications/:id/approve", (req, res) => {
  const id = parseInt(req.params.id);
  const application = managerApplications.find(a => a.id === id);
  if (!application) return res.json({ error: "申请不存在" });
  if (application.status !== "pending") return res.json({ error: "该申请已处理" });
  ADMIN_ACCOUNTS[application.username] = {
    password: application.password,
    role: "manager",
    createdAt: new Date()
  };
  application.status = "approved";
  application.processedAt = new Date();
  res.json({ success: true, message: "✅ 申请已批准，管理员账号已创建" });
});

// 拒绝申请
app.patch("/api/admin/applications/:id/reject", (req, res) => {
  const id = parseInt(req.params.id);
  const application = managerApplications.find(a => a.id === id);
  if (!application) return res.json({ error: "申请不存在" });
  if (application.status !== "pending") return res.json({ error: "该申请已处理" });
  application.status = "rejected";
  application.processedAt = new Date();
  res.json({ success: true, message: "✅ 申请已拒绝" });
});

// 获取管理员列表
app.get("/api/admin/managers", (req, res) => {
  const list = Object.entries(ADMIN_ACCOUNTS).map(([username, data]) => ({
    username,
    role: data.role,
    createdAt: data.createdAt
  }));
  res.json({ managers: list });
});

// 删除管理员
app.delete("/api/admin/managers/:id", (req, res) => {
  const username = req.params.id;
  if (!ADMIN_ACCOUNTS[username]) return res.json({ error: "管理员不存在" });
  if (ADMIN_ACCOUNTS[username].role === "super") return res.json({ error: "不能删除超级管理员" });
  delete ADMIN_ACCOUNTS[username];
  res.json({ success: true, message: "✅ 管理员已删除" });
});

// 重置管理员密码
app.patch("/api/admin/managers/:id/reset-password", (req, res) => {
  const username = req.params.id;
  const { newPassword } = req.body;
  if (!ADMIN_ACCOUNTS[username]) return res.json({ error: "管理员不存在" });
  if (!newPassword) return res.json({ error: "请提供新密码" });
  ADMIN_ACCOUNTS[username].password = newPassword;
  res.json({ success: true, message: "✅ 密码已重置" });
});

// 获取奖品配置
app.get("/api/admin/config/rewards", (req, res) => {
  res.json({ rewards: rewardsConfig });
});

// 更新奖品配置
app.put("/api/admin/config/rewards", (req, res) => {
  const { rewards } = req.body;
  if (!Array.isArray(rewards)) return res.json({ error: "奖品数据格式错误" });
  rewardsConfig = rewards;
  res.json({ success: true, message: "✅ 奖品配置已更新" });
});

// 获取游戏说明
app.get("/api/admin/config/description", (req, res) => {
  res.json({ description: gameDescription });
});

// 更新游戏说明
app.put("/api/admin/config/description", (req, res) => {
  const { description } = req.body;
  if (!description) return res.json({ error: "说明不能为空" });
  gameDescription = description;
  res.json({ success: true, message: "✅ 游戏说明已更新" });
});

// 获取统计摘要
app.get("/api/admin/stats/summary", (req, res) => {
  const totalUsers = Object.keys(users).length;
  const totalSpins = Object.values(users).reduce((s, u) => s + (u.spinCount || 0), 0);
  const totalWinRecords = winRecords.length;
  const totalRecharge = rechargeRequests.filter(r => r.status === "approved").reduce((s, r) => s + r.amount, 0);
  const totalWithdraw = 0;
  res.json({ totalUsers, totalSpins, totalWinRecords, totalRecharge, totalWithdraw });
});

// 获取所有中奖记录
app.get("/api/admin/stats/records", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const start = (page - 1) * limit;
  const records = winRecords.slice().reverse();
  res.json({
    total: records.length,
    page,
    records: records.slice(start, start + limit)
  });
});

// 获取用户中奖记录
app.get("/api/admin/stats/user/:userId/records", (req, res) => {
  const userId = req.params.userId;
  const records = winRecords.filter(r => r.userId === userId);
  res.json({ userId, total: records.length, records: records.slice().reverse() });
});

// 获取收款账号列表
app.get("/api/admin/payment-accounts", (req, res) => {
  res.json({ accounts: paymentAccounts });
});

// 添加收款账号
app.post("/api/admin/payment-accounts", (req, res) => {
  const { name, bank, account, holder } = req.body;
  if (!name || !account) return res.json({ error: "请填写账号名称和账号" });
  const entry = { id: paymentAccountIdCounter++, name, bank: bank || "", account, holder: holder || "", createdAt: new Date() };
  paymentAccounts.push(entry);
  res.json({ success: true, message: "✅ 收款账号已添加", account: entry });
});

// 删除收款账号
app.delete("/api/admin/payment-accounts/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const idx = paymentAccounts.findIndex(a => a.id === id);
  if (idx === -1) return res.json({ error: "账号不存在" });
  paymentAccounts.splice(idx, 1);
  res.json({ success: true, message: "✅ 收款账号已删除" });
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
