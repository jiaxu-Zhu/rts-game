// 多人在线实时战略游戏
class RTSGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.minimapCanvas = document.getElementById('minimapCanvas');
        this.minimapCtx = this.minimapCanvas.getContext('2d');

        // 游戏状态
        this.gameState = 'lobby'; // lobby, playing, paused, gameover
        this.isConnected = false;
        this.playerId = null;
        this.players = {};
        this.buildings = [];
        this.units = [];
        this.resources = [];
        this.projectiles = [];

        // 选择状态
        this.selectedObjects = [];
        this.selectionBox = null;
        this.isDragging = false;
        this.dragStart = null;

        // 资源
        this.gold = 100;
        this.wood = 100;
        this.goldRate = 0;
        this.woodRate = 0;

        // 地图
        this.mapWidth = 2000;
        this.mapHeight = 1500;
        this.camera = { x: 0, y: 0, zoom: 1 };

        // 游戏循环
        this.lastTime = 0;
        this.gameLoop = null;

        // 初始化
        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.connectToServer();
        this.updateUI();
    }

    setupCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.minimapCanvas.width = 150;
        this.minimapCanvas.height = 150;
    }

    setupEventListeners() {
        // 窗口调整
        window.addEventListener('resize', () => this.setupCanvas());

        // 鼠标事件
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e));

        // 触摸事件（移动端）
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));

        // UI按钮
        document.getElementById('startGameBtn').addEventListener('click', () => this.startGame());
        document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
        document.getElementById('restartBtn').addEventListener('click', () => this.restartGame());
        document.getElementById('helpBtn').addEventListener('click', () => this.showHelp());

        // 建筑和单位按钮
        document.querySelectorAll('.building-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectBuilding(btn.dataset.building));
        });
        document.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectUnit(btn.dataset.unit));
        });

        // 模态框关闭
        document.querySelectorAll('.close').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal());
        });
        document.getElementById('playAgainBtn').addEventListener('click', () => this.restartGame());
    }

    connectToServer() {
        this.socket = io();
        this.updateConnectionStatus('connecting');

        this.socket.on('connect', () => {
            this.isConnected = true;
            this.playerId = this.socket.id;
            document.getElementById('playerId').textContent = this.playerId.substring(0, 8);
            this.updateConnectionStatus('connected');
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.updateConnectionStatus('disconnected');
        });

        this.socket.on('gameState', (state) => {
            this.players = state.players;
            this.buildings = state.buildings;
            this.units = state.units;
            this.resources = state.resources;
            this.updateUI();
        });

        this.socket.on('playerJoined', (player) => {
            console.log('玩家加入:', player.id);
        });

        this.socket.on('playerLeft', (playerId) => {
            console.log('玩家离开:', playerId);
        });

        this.socket.on('gameOver', (data) => {
            this.gameOver(data.winner === this.playerId);
        });
    }

    updateConnectionStatus(status) {
        const statusEl = document.getElementById('connectionStatus');
        statusEl.className = `status ${status}`;
        statusEl.textContent = status === 'connected' ? '已连接' :
                               status === 'connecting' ? '连接中...' : '未连接';
    }

    startGame() {
        if (!this.isConnected) {
            alert('请等待连接服务器');
            return;
        }
        this.gameState = 'playing';
        this.socket.emit('startGame');
        this.lastTime = performance.now();
        this.gameLoop = requestAnimationFrame((t) => this.update(t));
    }

    togglePause() {
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
            cancelAnimationFrame(this.gameLoop);
        } else if (this.gameState === 'paused') {
            this.gameState = 'playing';
            this.lastTime = performance.now();
            this.gameLoop = requestAnimationFrame((t) => this.update(t));
        }
    }

    restartGame() {
        cancelAnimationFrame(this.gameLoop);
        this.gameState = 'lobby';
        this.selectedObjects = [];
        this.selectionBox = null;
        this.socket.emit('restartGame');
        this.closeModal();
        this.updateUI();
    }

    gameOver(isWinner) {
        this.gameState = 'gameover';
        cancelAnimationFrame(this.gameLoop);
        const modal = document.getElementById('gameOverModal');
        const title = document.getElementById('gameOverTitle');
        const message = document.getElementById('gameOverMessage');
        title.textContent = isWinner ? '🎉 胜利！' : '💀 失败';
        message.textContent = isWinner ? '恭喜你摧毁了敌方基地！' : '你的基地被摧毁了...';
        modal.style.display = 'flex';
    }

    showHelp() {
        document.getElementById('helpModal').style.display = 'flex';
    }

    closeModal() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }

    // 选择建筑类型
    selectedBuildingType = null;
    selectBuilding(type) {
        this.selectedBuildingType = type;
        this.selectedUnitType = null;
        this.updateUI();
    }

    // 选择单位类型
    selectedUnitType = null;
    selectUnit(type) {
        this.selectedUnitType = type;
        this.selectedBuildingType = null;
        this.updateUI();
    }

    // 鼠标事件处理
    getWorldPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.camera.x) / this.camera.zoom;
        const y = (e.clientY - rect.top - this.camera.y) / this.camera.zoom;
        return { x, y };
    }

    onMouseDown(e) {
        if (e.button === 0) { // 左键
            this.isDragging = true;
            this.dragStart = this.getWorldPos(e);
            this.selectionBox = {
                x: this.dragStart.x,
                y: this.dragStart.y,
                width: 0,
                height: 0
            };
        } else if (e.button === 2) { // 右键
            const pos = this.getWorldPos(e);
            if (this.selectedObjects.length > 0) {
                this.socket.emit('command', {
                    type: 'move',
                    target: pos,
                    unitIds: this.selectedObjects.filter(o => o.type === 'unit').map(u => u.id)
                });
            }
        }
    }

    onMouseMove(e) {
        if (this.isDragging && this.selectionBox) {
            const pos = this.getWorldPos(e);
            this.selectionBox.width = pos.x - this.dragStart.x;
            this.selectionBox.height = pos.y - this.dragStart.y;
        }
    }

    onMouseUp(e) {
        if (this.isDragging && this.selectionBox) {
            const pos = this.getWorldPos(e);
            const x1 = Math.min(this.dragStart.x, pos.x);
            const y1 = Math.min(this.dragStart.y, pos.y);
            const x2 = Math.max(this.dragStart.x, pos.x);
            const y2 = Math.max(this.dragStart.y, pos.y);

            // 框选单位
            this.socket.emit('selectUnits', {
                x1, y1, x2, y2,
                playerId: this.playerId
            });
        }
        this.isDragging = false;
        this.selectionBox = null;
    }

    onWheel(e) {
        e.preventDefault();
        const zoomSpeed = 0.001;
        const newZoom = Math.max(0.5, Math.min(2, this.camera.zoom - e.deltaY * zoomSpeed));
        this.camera.zoom = newZoom;
    }

    // 触摸事件（简化版）
    onTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.onMouseDown({ button: 0, clientX: touch.clientX, clientY: touch.clientY });
    }

    onTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }

    onTouchEnd(e) {
        e.preventDefault();
        this.onMouseUp({});
    }

    // 更新UI
    updateUI() {
        document.getElementById('gold').textContent = Math.floor(this.gold);
        document.getElementById('wood').textContent = Math.floor(this.wood);
        document.getElementById('playerCount').textContent = Object.keys(this.players).length;
        document.getElementById('unitCount').textContent = this.units.length;
        document.getElementById('buildingCount').textContent = this.buildings.length;

        // 更新选中信息
        if (this.selectedObjects.length > 0) {
            const obj = this.selectedObjects[0];
            document.getElementById('selectedName').textContent = obj.name || obj.type;
            document.getElementById('selectedHealth').textContent = `生命: ${Math.floor(obj.health)}/${obj.maxHealth}`;
            document.getElementById('selectedStats').textContent = `属性: ${JSON.stringify(obj.stats || {})}`;
        } else {
            document.getElementById('selectedName').textContent = '无';
            document.getElementById('selectedHealth').textContent = '生命: -';
            document.getElementById('selectedStats').textContent = '属性: -';
        }

        // 更新按钮状态
        document.querySelectorAll('.building-btn, .unit-btn').forEach(btn => {
            const costGold = parseInt(btn.dataset.costGold);
            const costWood = parseInt(btn.dataset.costWood);
            btn.disabled = this.gold < costGold || this.wood < costWood;
            btn.style.opacity = btn.disabled ? '0.5' : '1';
        });
    }

    // 游戏主循环
    update(currentTime) {
        if (this.gameState !== 'playing') return;

        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // 更新游戏逻辑
        this.updateGame(deltaTime);

        // 渲染
        this.render();

        // 更新小地图
        this.renderMinimap();

        // 继续循环
        this.gameLoop = requestAnimationFrame((t) => this.update(t));
    }

    updateGame(deltaTime) {
        // 这里会从服务器获取最新状态
        // 暂时使用本地数据
    }

    // 渲染
    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 保存状态
        ctx.save();
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.translate(-this.camera.x, -this.camera.y);

        // 绘制地图背景
        this.drawMap();

        // 绘制资源
        this.resources.forEach(resource => this.drawResource(resource));

        // 绘制建筑
        this.buildings.forEach(building => this.drawBuilding(building));

        // 绘制单位
        this.units.forEach(unit => this.drawUnit(unit));

        // 绘制选择框
        if (this.selectionBox) {
            this.drawSelectionBox();
        }

        // 恢复状态
        ctx.restore();
    }

    drawMap() {
        const ctx = this.ctx;
        ctx.fillStyle = '#2d3436';
        ctx.fillRect(0, 0, this.mapWidth, this.mapHeight);

        // 绘制网格
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let x = 0; x < this.mapWidth; x += 50) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.mapHeight);
            ctx.stroke();
        }
        for (let y = 0; y < this.mapHeight; y += 50) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.mapWidth, y);
            ctx.stroke();
        }

        // 绘制地图边界
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, this.mapWidth, this.mapHeight);
    }

    drawResource(resource) {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = resource.type === 'gold' ? '#ffd700' : '#8b4513';
        ctx.beginPath();
        ctx.arc(resource.x, resource.y, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(resource.type === 'gold' ? '💰' : '🪵', resource.x, resource.y + 4);
        ctx.restore();
    }

    drawBuilding(building) {
        const ctx = this.ctx;
        ctx.save();

        // 建筑颜色（不同玩家不同颜色）
        const color = this.getPlayerColor(building.playerId);
        ctx.fillStyle = color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;

        const size = building.type === 'base' ? 60 : 40;
        ctx.fillRect(building.x - size/2, building.y - size/2, size, size);
        ctx.strokeRect(building.x - size/2, building.y - size/2, size, size);

        // 绘制图标
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const icon = this.getBuildingIcon(building.type);
        ctx.fillText(icon, building.x, building.y);

        // 血条
        this.drawHealthBar(building.x, building.y - size/2 - 10, size, 5, building.health, building.maxHealth);

        ctx.restore();
    }

    drawUnit(unit) {
        const ctx = this.ctx;
        ctx.save();

        const color = this.getPlayerColor(unit.playerId);
        ctx.fillStyle = color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;

        const radius = unit.type === 'soldier' ? 10 : unit.type === 'archer' ? 8 : 6;
        ctx.beginPath();
        ctx.arc(unit.x, unit.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 绘制图标
        ctx.fillStyle = '#fff';
        ctx.font = radius + 'px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const icon = this.getUnitIcon(unit.type);
        ctx.fillText(icon, unit.x, unit.y);

        // 血条
        this.drawHealthBar(unit.x, unit.y - radius - 8, radius * 2, 3, unit.health, unit.maxHealth);

        ctx.restore();
    }

    drawHealthBar(x, y, width, height, health, maxHealth) {
        const ctx = this.ctx;
        const ratio = health / maxHealth;
        ctx.fillStyle = '#333';
        ctx.fillRect(x - width/2, y, width, height);
        ctx.fillStyle = ratio > 0.5 ? '#4caf50' : ratio > 0.25 ? '#ff9800' : '#f44336';
        ctx.fillRect(x - width/2, y, width * ratio, height);
    }

    drawSelectionBox() {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(
            this.selectionBox.x,
            this.selectionBox.y,
            this.selectionBox.width,
            this.selectionBox.height
        );
        ctx.restore();
    }

    renderMinimap() {
        const ctx = this.minimapCtx;
        const scale = 150 / Math.max(this.mapWidth, this.mapHeight);

        ctx.clearRect(0, 0, 150, 150);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, 150, 150);

        // 绘制建筑
        this.buildings.forEach(building => {
            ctx.fillStyle = this.getPlayerColor(building.playerId);
            ctx.fillRect(
                building.x * scale - 2,
                building.y * scale - 2,
                4, 4
            );
        });

        // 绘制单位
        this.units.forEach(unit => {
            ctx.fillStyle = this.getPlayerColor(unit.playerId);
            ctx.beginPath();
            ctx.arc(unit.x * scale, unit.y * scale, 1, 0, Math.PI * 2);
            ctx.fill();
        });

        // 绘制视野范围
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        const viewX = this.camera.x * scale;
        const viewY = this.camera.y * scale;
        const viewW = this.canvas.width * this.camera.zoom * scale;
        const viewH = this.canvas.height * this.camera.zoom * scale;
        ctx.strokeRect(viewX, viewY, viewW, viewH);
    }

    getPlayerColor(playerId) {
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];
        const index = playerId ? parseInt(playerId.substring(0, 4), 16) % colors.length : 0;
        return colors[index];
    }

    getBuildingIcon(type) {
        const icons = {
            'base': '🏛️',
            'barracks': '🏚️',
            'gold-mine': '⛏️',
            'lumber-camp': '🪓'
        };
        return icons[type] || '🏠';
    }

    getUnitIcon(type) {
        const icons = {
            'worker': '👷',
            'soldier': '⚔️',
            'archer': '🏹'
        };
        return icons[type] || '👤';
    }
}

// 启动游戏
window.addEventListener('DOMContentLoaded', () => {
    window.game = new RTSGame();
});