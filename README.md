# 用 Claude 玩上 GTA6 · 公开赚钱挑战（带记账后台）

一个全程公开记录的挑战网站：在 **GTA6 发售（2026-11-19）之前**，只靠用 Claude 做的项目攒够「零钱」，凑齐客厅全套（PS5 Pro + 电视 + 游戏 + 沙发），搬进 GTA6。

设计风格：**animal-island-ui（《集合啦！动物森友会》启发）** —— 草地绿岛、暖羊皮纸卡片、大圆角 pill、燕尾飘带标题、游戏按键立体感。把"攒钱"做成"还 Nook 贷款"的温馨叙事。

现在带一个**轻量记账后台**：登录后台 → 加一笔收入 / 改目标，前台自动更新，不用再手改文件。

## 目录结构

```
gta6-challenge/
├── server.js              # Node 服务：前台 + 后台 API（零数据库）
├── package.json
├── public/                # 静态资源（也可单独纯静态部署）
│   ├── index.html         # 前台页面
│   ├── admin.html         # 后台页面（登录 + 记账）
│   ├── styles/            # tokens.css / style.css / admin.css
│   ├── scripts/           # main.js（前台） / admin.js（后台）
│   └── data/
│       ├── challenge.json # ← 数据真源（后台读写）
│       └── challenge.js   # 自动生成的静态兜底（纯静态部署用）
```

## 跑起来（带后台）

```bash
cd gta6-challenge
npm install
ADMIN_PASSWORD=你的密码 npm start
```

- 前台： http://localhost:3000/
- 后台： http://localhost:3000/admin

> ⚠️ 一定要用 `ADMIN_PASSWORD` 设你自己的密码（不设会用默认密码 `gta6-island`，仅供本地试用）。
> 端口可用 `PORT` 改，例如 `PORT=8080`。

## 怎么记一笔账（后台，最常用）

1. 打开 `/admin`，输入密码登录。
2. 「记一笔零钱」填：日期、金额、项目（来自哪个 Claude 项目）、备注/链接（可选）→ 点「添加进账」。
3. 前台总额、进度条、还差多少、每天要赚多少、项目战绩，全部自动重算。
4. 列表里每条都能「改 / 删」。
5. 「搬家清单 · 目标」里维护要买的几件（图标+名称+价格，可增删），**目标金额按清单自动求和**；前台会把它渲染成「攒够一件点亮一件」的心愿单（便宜的先解锁）。还能改截止日、社媒昵称/主页。

每次后台保存，会同时写 `challenge.json`（真源）和重新生成 `challenge.js`（静态兜底），两边始终同步。

## 备用：手动记账（不开后台时）

直接编辑 `public/data/challenge.json` 的 `entries` 数组也行：

```json
{ "date": "2026-07-01", "project": "双吉AI发卡网", "amount": 12.0, "note": "首单破零", "link": "https://cngptplus.shop" }
```

## 部署

- **VPS（推荐，带后台）**：`npm install && ADMIN_PASSWORD=xxx PORT=80 npm start`，建议用 pm2/systemd 守护，前面挂 Nginx + HTTPS。
- **纯静态（无后台）**：只把 `public/` 丢到 Vercel / GitHub Pages / Nginx 即可。前台会回退读 `challenge.js`，记账则靠手动改文件。

## 发社媒

页面在 320 / 768 / 1024 / 1440 都做了响应式，动森风格截图很出片、很可爱。
建议每记一笔就截一张「零钱账本 + 倒计时」区域发出去，做成连续的挑战日志。
