const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let users = {};

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
    reward: { type: reward.type, name: reward.name, value: reward.value, rarity: reward.rarity, icon: reward.icon }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("\n🎉 ========================================");
  console.log("🎉 幸运转盘服务器启动成功！");
  console.log("🌐 访问地址: http://localhost:" + PORT);
  console.log("🎉 ========================================\n");
});
