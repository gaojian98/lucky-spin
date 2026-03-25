const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 
let users = {};

// 注册
app.post("/register", (req, res) => {
  const { userId } = req.body;
  if (!users[userId]) {
    users[userId] = {
      points: 100000,
      cash: 0
    };
  }
  res.json(users[userId]);
});

// 查询用户
app.get("/user/:id", (req, res) => {
  res.json(users[req.params.id] || null);
});

// 抽奖
app.post("/spin", (req, res) => {
  const { userId } = req.body;
  let user = users[userId];

  if (!user || user.points < 50000) {
    return res.json({ error: "积分不足" });
  }

  user.points -= 50000;

  const rewards = [
    { type: "points", value: 10000 },
    { type: "points", value: 20000 },
    { type: "cash", value: 10000 },
    { type: "none", value: 0 }
  ];

  let reward = rewards[Math.floor(Math.random() * rewards.length)];

  if (reward.type === "points") user.points += reward.value;
  if (reward.type === "cash") user.cash += reward.value;

  res.json({ reward, user });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("server running");
});
