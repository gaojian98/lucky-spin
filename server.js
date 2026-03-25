const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 
let users = {};

// 注册
let users = {};

app.post("/register", (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.json({ error: "no userId" });
  }

  // 如果用户不存在就创建
  if (!users[userId]) {
    users[userId] = {
      points: 100000,
      cash: 0
    };
  }

  // 👇 一定要返回这个结构
  res.json({
    points: users[userId].points,
    cash: users[userId].cash
  });
});

// 查询用户
app.get("/user/:id", (req, res) => {
  res.json(users[req.params.id] || null);
});

// 抽奖
app.post("/spin", (req, res) => {
  const { userId } = req.body;

  if (!users[userId]) {
    return res.json({ error: "请先注册" });
  }

  if (users[userId].points < 50000) {
    return res.json({ error: "积分不足" });
  }

  users[userId].points -= 50000;

  const rewards = [
    { type: "points", value: 10000 },
    { type: "points", value: 20000 },
    { type: "none", value: 0 },
    { type: "cash", value: 10000 }
  ];

  const reward = rewards[Math.floor(Math.random() * rewards.length)];

  if (reward.type === "points") {
    users[userId].points += reward.value;
  }

  if (reward.type === "cash") {
    users[userId].cash += reward.value;
  }

  res.json({
    user: users[userId],
    reward: reward
  });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("server running");
});
