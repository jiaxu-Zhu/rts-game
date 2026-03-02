// 多人在线实时战略游戏 - 服务器端
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 游戏配置
const CONFIG = {
    MAP_WIDTH: 2000,
    MAP_HEIGHT: 1500,
    TICK_RATE: 60,
    INITIAL_GOLD: 100,
    INITIAL_WOOD: 100,
    GOLD_PER_SECOND: 0.5,
    WOOD_PER_SECOND: 0.5,
    UNIT_SPEED: 50,
    ATTACK_RANGE: 100,
    ATTACK_COOLDOWN: 1.0,
    BUILDING_COSTS: {
        'base': { gold: 0, wood: 0 },
        'barracks': { gold: 50, wood: 30 },
        'gold-mine': { gold: 20, wood: 40 },
        'lumber-camp': { gold: 30, wood: 20 }
    },
    UNIT_COSTS: {
        'worker': { gold: 25, wood: 10 },
        'soldier': { gold: 50, wood: 20 },
        'archer': { gold: 40, wood: 30 }
    },
    UNIT_STATS: {
        'worker': { health: 50, maxHealth: 50, damage: 5, speed: 40, range: 30, attackSpeed: 1.5 },
        'soldier': { health: 100, maxHealth: 100, damage: 15, speed: 35, range: 50, attackSpeed: 1.2 },
        'archer': { health: 60, maxHealth: 60, damage: 20, speed: 30, range: 150, attackSpeed: 2.0 }
    },
    BUILDING_STATS: {
        'base': { health: 2000, maxHealth: 2000 },
        'barracks': { health: 800, maxHealth: 800 },
        'gold-mine': { health: 500, maxHealth: 500 },
        'lumber-camp': { health: 500, maxHealth: 500 }
    }
};

// 游戏状态
class GameState {
    constructor() {
        this.players = {};
        this.buildings = [];
        this.units = [];
        this.resources = [];
        this.projectiles = [];
        this.gameStarted = false;
        this.gameTime = 0;
    }

    addPlayer(socketId, name) {
        this.players[socketId] = {
            id: socketId,
            name: name || `玩家${Object.keys(this.players).length + 1}`,
            gold: CONFIG.INITIAL_GOLD,
            wood: CONFIG.INITIAL_WOOD,
            goldRate: CONFIG.GOLD_PER_SECOND,
            woodRate: CONFIG.WOOD_PER_SECOND,
            color: this.getRandomColor(),
            selectedUnits: [],
            ready: false
        };

        // 为玩家创建初始基地
        const spawnX = Math.random() * (CONFIG.MAP_WIDTH - 200) + 100;
        const spawnY = Math.random() * (CONFIG.MAP_HEIGHT - 200) + 100;

        this.buildings.push({
            id: uuidv4(),
            type: 'base',
            playerId: socketId,
            x: spawnX,
            y: spawnY,
            health: CONFIG.BUILDING_STATS['base'].health,
            maxHealth: CONFIG.BUILDING_STATS['base'].maxHealth,
            productionQueue: [],
            productionProgress: 0
        });

        // 创建初始工人
        for (let i = 0; i < 3; i++) {
            this.units.push({
                id: uuidv4(),
                type: 'worker',
                playerId: socketId,
                x: spawnX + (Math.random() - 0.5) * 50,
                y: spawnY + (Math.random() - 0.5) * 50,
                health: CONFIG.UNIT_STATS['worker'].health,
                maxHealth: CONFIG.UNIT_STATS['worker'].maxHealth,
                damage: CONFIG.UNIT_STATS['worker'].damage,
                speed: CONFIG.UNIT_STATS['worker'].speed,
                range: CONFIG.UNIT_STATS['worker'].range,
                attackSpeed: CONFIG.UNIT_STATS['worker'].attackSpeed,
                attackCooldown: 0,
                target: null,
                state: 'idle',
                resourceCarrying: null
            });
        }

        // 生成资源点
        if (this.resources.length === 0) {
            this.generateResources();
        }

        return this.players[socketId];
    }

    generateResources() {
        const numGoldMines = 8;
        const numLumberCamps = 8;

        for (let i = 0; i < numGoldMines; i++) {
            this.resources.push({
                id: uuidv4(),
                type: 'gold',
                x: Math.random() * (CONFIG.MAP_WIDTH - 100) + 50,
                y: Math.random() * (CONFIG.MAP_HEIGHT - 100) + 50,
                amount: 1000
            });
        }

        for (let i = 0; i < numLumberCamps; i++) {
            this.resources.push({
                id: uuidv4(),
                type: 'wood',
                x: Math.random() * (CONFIG.MAP_WIDTH - 100) + 50,
                y: Math.random() * (CONFIG.MAP_HEIGHT - 100) + 50,
                amount: 1000
            });
        }
    }

    getRandomColor() {
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    removePlayer(socketId) {
        // 移除玩家的所有单位和建筑
        this.units = this.units.filter(u => u.playerId !== socketId);
        this.buildings = this.buildings.filter(b => b.playerId !== socketId);
        delete this.players[socketId];
    }

    update(deltaTime) {
        if (!this.gameStarted) return;

        this.gameTime += deltaTime;

        // 更新资源产出
        Object.values(this.players).forEach(player => {
            player.gold += player.goldRate * deltaTime;
            player.wood += player.woodRate * deltaTime;
        });

        // 更新单位
        this.units.forEach(unit => {
            this.updateUnit(unit, deltaTime);
        });

        // 更新建筑生产
        this.buildings.forEach(building => {
            this.updateBuilding(building, deltaTime);
        });

        // 更新投射物
        this.updateProjectiles(deltaTime);

        // 清理死亡实体
        this.cleanupDead();
    }

    updateUnit(unit, deltaTime) {
        // 更新攻击冷却
        if (unit.attackCooldown > 0) {
            unit.attackCooldown -= deltaTime;
        }

        // 根据状态行动
        switch (unit.state) {
            case 'idle':
                // 空闲状态，什么都不做
                break;

            case 'moving':
                this.moveUnit(unit, deltaTime);
                break;

            case 'gathering':
                this.gatherResource(unit, deltaTime);
                break;

            case 'returning':
                this.returnToBase(unit, deltaTime);
                break;

            case 'attacking':
                this.attackTarget(unit, deltaTime);
                break;
        }
    }

    moveUnit(unit, deltaTime) {
        if (!unit.target) {
            unit.state = 'idle';
            return;
        }

        const dx = unit.target.x - unit.x;
        const dy = unit.target.y - unit.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 5) {
            unit.x = unit.target.x;
            unit.y = unit.target.y;
            unit.state = 'idle';
            unit.target = null;
        } else {
            const speed = unit.speed * deltaTime;
            unit.x += (dx / distance) * speed;
            unit.y += (dy / distance) * speed;
        }
    }

    gatherResource(unit, deltaTime) {
        if (!unit.target || unit.target.type !== 'resource') {
            unit.state = 'idle';
            return;
        }

        const resource = this.resources.find(r => r.id === unit.target.id);
        if (!resource || resource.amount <= 0) {
            unit.state = 'idle';
            unit.target = null;
            return;
        }

        const dx = unit.x - resource.x;
        const dy = unit.y - resource.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 30) {
            // 移动到资源点
            unit.target = { x: resource.x, y: resource.y };
            this.moveUnit(unit, deltaTime);
        } else {
            // 采集资源
            unit.state = 'gathering';
            resource.amount -= 10 * deltaTime;

            if (resource.amount <= 0) {
                // 资源耗尽
                const index = this.resources.indexOf(resource);
                if (index > -1) {
                    this.resources.splice(index, 1);
                }
                unit.state = 'idle';
                unit.target = null;
            } else if (Math.random() < 0.1) {
                // 携带资源返回
                unit.resourceCarrying = resource.type;
                unit.state = 'returning';
                const base = this.buildings.find(b => b.playerId === unit.playerId && b.type === 'base');
                if (base) {
                    unit.target = { x: base.x, y: base.y };
                }
            }
        }
    }

    returnToBase(unit, deltaTime) {
        if (!unit.target) {
            const base = this.buildings.find(b => b.playerId === unit.playerId && b.type === 'base');
            if (base) {
                unit.target = { x: base.x, y: base.y };
            } else {
                unit.state = 'idle';
                return;
            }
        }

        this.moveUnit(unit, deltaTime);

        const dx = unit.x - unit.target.x;
        const dy = unit.y - unit.target.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 30) {
            // 到达基地，交付资源
            const player = this.players[unit.playerId];
            if (unit.resourceCarrying === 'gold') {
                player.gold += 10;
            } else if (unit.resourceCarrying === 'wood') {
                player.wood += 10;
            }
            unit.resourceCarrying = null;
            unit.state = 'idle';
            unit.target = null;
        }
    }

    attackTarget(unit, deltaTime) {
        if (!unit.target) {
            unit.state = 'idle';
            return;
        }

        const target = this.findTarget(unit.target);
        if (!target) {
            unit.state = 'idle';
            unit.target = null;
            return;
        }

        const dx = target.x - unit.x;
        const dy = target.y - unit.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > unit.range) {
            // 移动到攻击范围
            const moveX = unit.x + (dx / distance) * unit.speed * deltaTime;
            const moveY = unit.y + (dy / distance) * unit.speed * deltaTime;
            unit.x = moveX;
            unit.y = moveY;
        } else {
            // 在攻击范围内，进行攻击
            if (unit.attackCooldown <= 0) {
                this.performAttack(unit, target);
                unit.attackCooldown = unit.attackSpeed;
            }
        }
    }

    performAttack(unit, target) {
        // 创建投射物或直接伤害
        if (unit.range > 100) {
            // 远程单位创建投射物
            this.projectiles.push({
                id: uuidv4(),
                x: unit.x,
                y: unit.y,
                targetId: target.id,
                targetType: target.type,
                damage: unit.damage,
                speed: 200,
                playerId: unit.playerId
            });
        } else {
            // 近战单位直接伤害
            target.health -= unit.damage;
        }
    }

    updateProjectiles(deltaTime) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            const target = this.findTarget(proj.targetId, proj.targetType);

            if (!target) {
                this.projectiles.splice(i, 1);
                continue;
            }

            const dx = target.x - proj.x;
            const dy = target.y - proj.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 10) {
                // 命中目标
                target.health -= proj.damage;
                this.projectiles.splice(i, 1);
            } else {
                // 移动投射物
                const speed = proj.speed * deltaTime;
                proj.x += (dx / distance) * speed;
                proj.y += (dy / distance) * speed;
            }
        }
    }

    findTarget(id, type = null) {
        if (type === 'unit') {
            return this.units.find(u => u.id === id);
        } else if (type === 'building') {
            return this.buildings.find(b => b.id === id);
        }
        return null;
    }

    updateBuilding(building, deltaTime) {
        // 建筑生产单位
        if (building.productionQueue.length > 0) {
            building.productionProgress += deltaTime;
            const unitType = building.productionQueue[0];
            const productionTime = 5; // 5秒生产一个单位

            if (building.productionProgress >= productionTime) {
                this.createUnit(building, unitType);
                building.productionQueue.shift();
                building.productionProgress = 0;
            }
        }
    }

    createUnit(building, unitType) {
        const stats = CONFIG.UNIT_STATS[unitType];
        this.units.push({
            id: uuidv4(),
            type: unitType,
            playerId: building.playerId,
            x: building.x + (Math.random() - 0.5) * 30,
            y: building.y + (Math.random() - 0.5) * 30,
            health: stats.health,
            maxHealth: stats.maxHealth,
            damage: stats.damage,
            speed: stats.speed,
            range: stats.range,
            attackSpeed: stats.attackSpeed,
            attackCooldown: 0,
            target: null,
            state: 'idle',
            resourceCarrying: null
        });
    }

    cleanupDead() {
        // 移除死亡的建筑
        this.buildings = this.buildings.filter(b => b.health > 0);

        // 移除死亡的单位
        this.units = this.units.filter(u => u.health > 0);

        // 检查游戏结束条件
        Object.keys(this.players).forEach(playerId => {
            const playerBuildings = this.buildings.filter(b => b.playerId === playerId);
            if (playerBuildings.length === 0) {
                // 玩家被消灭
                this.eliminatePlayer(playerId);
            }
        });
    }

    eliminatePlayer(playerId) {
        if (this.gameStarted) {
            const winner = Object.keys(this.players).find(id => id !== playerId);
            io.emit('gameOver', {
                winner: winner || null,
                loser: playerId
            });
        }
        this.removePlayer(playerId);
    }

    // 处理玩家命令
    handleCommand(playerId, command) {
        const player = this.players[playerId];
        if (!player) return;

        switch (command.type) {
            case 'move':
                this.commandMove(playerId, command.unitIds, command.target);
                break;
            case 'attack':
                this.commandAttack(playerId, command.unitIds, command.target);
                break;
            case 'build':
                this.commandBuild(playerId, command.buildingType, command.position);
                break;
            case 'train':
                this.commandTrain(playerId, command.buildingId, command.unitType);
                break;
            case 'gather':
                this.commandGather(playerId, command.unitIds, command.resourceId);
                break;
        }
    }

    commandMove(playerId, unitIds, target) {
        unitIds.forEach(unitId => {
            const unit = this.units.find(u => u.id === unitId && u.playerId === playerId);
            if (unit) {
                unit.target = { x: target.x, y: target.y };
                unit.state = 'moving';
            }
        });
    }

    commandAttack(playerId, unitIds, target) {
        unitIds.forEach(unitId => {
            const unit = this.units.find(u => u.id === unitId && u.playerId === playerId);
            if (unit) {
                unit.target = { id: target.id, type: target.type };
                unit.state = 'attacking';
            }
        });
    }

    commandBuild(playerId, buildingType, position) {
        const player = this.players[playerId];
        const cost = CONFIG.BUILDING_COSTS[buildingType];

        if (!cost || player.gold < cost.gold || player.wood < cost.wood) {
            return; // 资源不足
        }

        // 扣除资源
        player.gold -= cost.gold;
        player.wood -= cost.wood;

        // 创建建筑
        this.buildings.push({
            id: uuidv4(),
            type: buildingType,
            playerId: playerId,
            x: position.x,
            y: position.y,
            health: CONFIG.BUILDING_STATS[buildingType].health,
            maxHealth: CONFIG.BUILDING_STATS[buildingType].maxHealth,
            productionQueue: [],
            productionProgress: 0
        });

        // 如果是矿场或伐木场，增加资源产出
        if (buildingType === 'gold-mine') {
            player.goldRate += 0.5;
        } else if (buildingType === 'lumber-camp') {
            player.woodRate += 0.5;
        }
    }

    commandTrain(playerId, buildingId, unitType) {
        const player = this.players[playerId];
        const building = this.buildings.find(b => b.id === buildingId && b.playerId === playerId);
        const cost = CONFIG.UNIT_COSTS[unitType];

        if (!building || !cost || player.gold < cost.gold || player.wood < cost.wood) {
            return; // 资源不足或建筑不存在
        }

        // 扣除资源
        player.gold -= cost.gold;
        player.wood -= cost.wood;

        // 加入生产队列
        building.productionQueue.push(unitType);
    }

    commandGather(playerId, unitIds, resourceId) {
        const resource = this.resources.find(r => r.id === resourceId);
        if (!resource) return;

        unitIds.forEach(unitId => {
            const unit = this.units.find(u => u.id === unitId && u.playerId === playerId && u.type === 'worker');
            if (unit) {
                unit.target = resource;
                unit.state = 'gathering';
            }
        });
    }

    // 获取游戏状态快照
    getSnapshot() {
        return {
            players: this.players,
            buildings: this.buildings,
            units: this.units,
            resources: this.resources,
            projectiles: this.projectiles,
            gameTime: this.gameTime,
            gameStarted: this.gameStarted
        };
    }
}

// 游戏实例
const game = new GameState();

// 游戏循环
setInterval(() => {
    if (game.gameStarted) {
        game.update(1 / CONFIG.TICK_RATE);
        io.emit('gameState', game.getSnapshot());
    }
}, 1000 / CONFIG.TICK_RATE);

// Socket.io 连接处理
io.on('connection', (socket) => {
    console.log('玩家连接:', socket.id);

    // 玩家加入
    socket.on('join', (data) => {
        const player = game.addPlayer(socket.id, data.name);
        socket.emit('joined', {
            playerId: socket.id,
            gameState: game.getSnapshot()
        });
        io.emit('playerJoined', player);
    });

    // 开始游戏
    socket.on('startGame', () => {
        if (!game.gameStarted) {
            game.gameStarted = true;
            io.emit('gameStarted');
        }
    });

    // 玩家命令
    socket.on('command', (command) => {
        game.handleCommand(socket.id, command);
    });

    // 选择单位
    socket.on('selectUnits', (selection) => {
        const player = game.players[socket.id];
        if (!player) return;

        player.selectedUnits = game.units.filter(unit => {
            if (unit.playerId !== socket.id) return false;
            if (unit.type !== 'unit') return false; // 只选择单位，不选择建筑
            return unit.x >= selection.x1 && unit.x <= selection.x2 &&
                   unit.y >= selection.y1 && unit.y <= selection.y2;
        });
    });

    // 重新开始
    socket.on('restartGame', () => {
        game.gameStarted = false;
        game.gameTime = 0;
        game.buildings = [];
        game.units = [];
        game.resources = [];
        game.projectiles = [];
        Object.keys(game.players).forEach(id => {
            game.addPlayer(id, game.players[id].name);
        });
        io.emit('gameRestarted');
    });

    // 断开连接
    socket.on('disconnect', () => {
        console.log('玩家断开:', socket.id);
        game.removePlayer(socket.id);
        io.emit('playerLeft', socket.id);
    });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎮 RTS 游戏服务器运行在端口 ${PORT}`);
    console.log(`🌐 访问地址: http://localhost:${PORT}`);
});