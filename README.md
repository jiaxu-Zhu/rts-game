# 🎮 多人在线实时战略游戏

一个基于 Web 的 2D 俯视角实时战略游戏（RTS），支持多人实时对战。

## 🎯 游戏特色

- 🌍 **多人在线**：通过 WebSocket 实时对战
- ⛏️ **资源管理**：采集金矿和木材
- 🏗️ **基地建设**：建造建筑和单位
- ⚔️ **实时战斗**：指挥单位战斗
- 📱 **响应式设计**：支持桌面和移动端

## 🚀 快速开始

### 前端部署（GitHub Pages）

1. Fork 本仓库
2. 启用 GitHub Pages（Settings → Pages → Source: main branch）
3. 访问 `https://你的用户名.github.io/rts-game`

### 后端部署（推荐 Railway）

```bash
# 克隆项目
git clone https://github.com/你的用户名/rts-game.git
cd rts-game

# 安装依赖
npm install

# 启动服务器
npm start
```

## 🎮 游戏玩法

1. **采集资源**：点击金矿和木材开始采集
2. **建造建筑**：消耗资源建造兵营、矿场等
3. **训练单位**：生产工人、战士等单位
4. **指挥战斗**：选中单位，点击敌人进行攻击
5. **摧毁敌方基地**：消灭所有敌人获胜！

## 📁 项目结构

```
rts-game/
├── public/           # 前端静态文件
│   ├── index.html   # 主页面
│   ├── style.css    # 样式
│   └── game.js      # 游戏逻辑
├── server.js        # 后端服务器
├── package.json     # 依赖配置
└── README.md        # 说明文档
```

## 🔧 技术栈

- **前端**：HTML5 Canvas, Vanilla JavaScript
- **后端**：Node.js, Express, Socket.io
- **部署**：GitHub Pages + Railway/Render

## 📝 开发计划

- [x] 基础游戏框架
- [x] 资源系统
- [x] 建筑系统
- [x] 单位系统
- [x] 战斗系统
- [x] 多人联机
- [ ] 更多单位类型
- [ ] 科技升级
- [ ] 地图编辑器

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License