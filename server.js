const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 

// 注册
let users = {};

app.post("/register", (req, res) => {
  const { userId, password, phone, bank } = req.body;

  if (!userId || !password) {
    return res.json({ error: "信息不完整" });
  }

  if (users[userId]) {
  return res.json({ error: "用户已存在" });
}

users[userId] = {
  password,
  phone,
  bank,
  points: 100000,
  cash: 0
};

  res.json(users[userId]);
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
   { type: "iphone", value: 40000000 }, 
    { type: "airpods", value: 5000000 },
    { type: "points", value: 10000 },
    { type: "points", value: 20000 },
    { type: "none", value: 0 },
    { type: "cash", value: 10000 }
  ];

  const reward = rewards[Math.floor(Math.random() * rewards.length)];

let message = "";

if (reward.type === "points") {
  users[userId].points += reward.value;
  message = "获得积分：" + reward.value;
}

if (reward.type === "cash") {
  users[userId].cash += reward.value;
  message = "获得现金：" + reward.value + "越南盾";
}

if (reward.type === "none") {
  message = "谢谢参与";
}
  res.json({
    user: users[userId],
    reward: message
  });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("server running on port " + PORT);
});
