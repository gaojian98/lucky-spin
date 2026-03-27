const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());
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
app.listen(PORT, () => {
  console.log("\n🎉 ========================================");
  console.log("🎉 幸运转盘服务器启动成功！");
  console.log("🌐 访问地址: http://localhost:" + PORT);
  console.log("💰 充值接口已启用");
  console.log("📊 管理后台: http://localhost:" + PORT + "/admin.html");
  console.log("🎉 ========================================\n");
});
