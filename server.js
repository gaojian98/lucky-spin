const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ==================== 用户数据库 ====================
let users = {};

// ==================== 注册接口 ====================
app.post("/register", (req, res) => {
  const { username, password, phone, bank } = req.body;

  if (!username || !password || !phone || !bank) {
    return res.json({ error: "信息不完整" });
  }

  if (username.length < 3) {
    return res.json({ error: "用户名至少 3 个字符" });
  }

  if (password.length < 6) {
    return res.json({ error: "密码至少 6 个字符" });
  }

  if (users[username]) {
    return res.json({ error: "用户已存在" });
  }

  users[username] = {
    password,
    phone,
    bank,
    points: 100000,
    cash: 0,
    createdAt: new Date().toISOString(),
    spinCount: 0
  };

  console.log(`[注册] 新用户: ${username}`);

  res.json({
    user: {
      username,
      points: users[username].points,
      cash: users[username].cash
    }
  });
});

// ==================== 登录接口 ====================
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ error: "用户名和密码不能为空" });
  }

  if (!users[username]) {
    return res.json({ error: "用户不存在，请先注册" });
  }

  if (users[username].password !== password) {
    return res.json({ error: "密码错误" });
  }

  console.log(`[登录] 用户: ${username}`);

  res.json({
    user: {
      username,
      points: users[username].points,
      cash: users[username].cash
    }
  });
});

// ==================== 查询用户接口 ====================
app.get("/user/:username", (req, res) => {
  const user = users[req.params.username];

  if (!user) {
    return res.json({ error: "用户不存在" });
  }

  res.json({
    username: req.params.username,
    points: user.points,
    cash: user.cash,
    spinCount: user.spinCount
  });
});

// ==================== 抽奖接口 ====================
app.post("/spin", (req, res) => {
  const { userId } = req.body;

  if (!users[userId]) {
    return res.json({ error: "请先登录" });
  }

  const SPIN_COST = 30000;
  if (users[userId].points < SPIN_COST) {
    return res.json({
      error: `积分不足，需要 ${SPIN_COST.toLocaleString()} 积分，当前只有 ${users[userId].points.toLocaleString()} 积分`
    });
  }

  users[userId].points -= SPIN_COST;
  users[userId].spinCount += 1;

  // 奖项池（加权概率）
  const rewards = [
    { type: "iphone",  value: 40000000, weight: 1 },
    { type: "airpods", value: 5000000,  weight: 2 },
    { type: "cash",    value: 50000,    weight: 3 },
    { type: "cash",    value: 100000,   weight: 2 },
    { type: "points",  value: 50000,    weight: 4 },
    { type: "points",  value: 30000,    weight: 3 },
    { type: "points",  value: 10000,    weight: 2 },
    { type: "none",    value: 0,        weight: 6 }
  ];

  const totalWeight = rewards.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.floor(Math.random() * totalWeight);
  let selectedReward = rewards[0];

  for (const reward of rewards) {
    random -= reward.weight;
    if (random < 0) {
      selectedReward = reward;
      break;
    }
  }

  if (selectedReward.type === "points") {
    users[userId].points += selectedReward.value;
  } else if (selectedReward.type === "cash") {
    users[userId].cash += selectedReward.value;
  }

  console.log(`[抽奖] 用户: ${userId}, 奖项: ${selectedReward.type}, 值: ${selectedReward.value}`);

  res.json({
    user: {
      username: userId,
      points: users[userId].points,
      cash: users[userId].cash
    },
    reward: {
      type: selectedReward.type,
      value: selectedReward.value
    }
  });
});

// ==================== 服务器启动 ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 幸运转盘服务器运行在 http://localhost:${PORT}`);
  console.log(`📱 访问地址: http://localhost:${PORT}`);
});
