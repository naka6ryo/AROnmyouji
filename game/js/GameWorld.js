/**
 * GameWorld.js
 * 敵配列管理、スポーン制御、更新Δtを扱うクラス
 */

export class GameWorld {
    constructor() {
        // 敵配列
        this.enemies = [];
        this.nextEnemyId = 0;
        
        // 敵仕様（仕様書の値）
        this.ENEMY_HP = 1; // 1発で撃破
        this.ENEMY_DISTANCE_INITIAL = 3.5; // m相当
        this.ENEMY_APPROACH_SPEED = 0.45;  // r/秒
        this.ENEMY_HIT_DISTANCE = 0.9;     // r
        
        // スポーン制御
        this.spawnInterval = 2700;         // ms（初期, 少し広げる）
        this.minSpawnInterval = 1200;      // ms（最小, 少し広げる）
        this.spawnIntervalDecrement = 100; // ms（撃破ごとに短縮）
        this.nextSpawnTime = 0;
        
        // プレイヤー
        this.playerHP = 5;
        this.maxPlayerHP = 5;
        
        // 統計
        this.killCount = 0;
        this.damageCount = 0;
        
        // ゲーム時間
        this.gameTime = 0;
        this.maxGameTime = 120000; // 2分（ms）
        
        // コールバック
        this.onEnemySpawned = null;
        this.onEnemyKilled = null;
        this.onPlayerDamaged = null;
        this.onGameOver = null;
        this.onGameClear = null;
    }
    
    /**
     * ゲームを開始
     */
    startGame() {
        this.enemies = [];
        this.playerHP = this.maxPlayerHP;
        this.killCount = 0;
        this.damageCount = 0;
        this.gameTime = 0;
        this.spawnInterval = 2200;
        this.nextSpawnTime = performance.now() + 1000; // 1秒後に最初の敵
        
        console.log('[GameWorld] ゲーム開始');
    }
    
    /**
     * 更新（固定Δt推奨: 1/60秒）
     */
    update(deltaTime) {
        const now = performance.now();
        
        // ゲーム時間更新
        this.gameTime += deltaTime;
        
        // 終了条件チェック
        if (this.playerHP <= 0) {
            if (this.onGameOver) {
                this.onGameOver({ reason: 'hp_zero', killCount: this.killCount });
            }
            return;
        }
        
        if (this.gameTime >= this.maxGameTime) {
            if (this.onGameClear) {
                this.onGameClear({ killCount: this.killCount, time: this.gameTime });
            }
            return;
        }
        
        // スポーン処理
        if (now >= this.nextSpawnTime) {
            this.spawnEnemy();
            this.nextSpawnTime = now + this.spawnInterval;
        }
        
        // 敵の更新
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            
            // 接近
            enemy.distance -= this.ENEMY_APPROACH_SPEED * (deltaTime / 1000);
            
            // 被弾判定
            if (enemy.distance <= this.ENEMY_HIT_DISTANCE) {
                this.handlePlayerDamage(enemy);
                this.enemies.splice(i, 1);
            }
        }
    }
    
    /**
     * 敵をスポーン
     */
    spawnEnemy() {
        // ランダムな方向（球面座標）
        const azim = Math.random() * 360; // 0-360度
        // 上半球のみ。水平面付近に寄せて偏りを緩和（0〜60度）
        const elev = Math.random() * 60; // 0〜60度
        // 人魂タイプの敵（今は全て人魂、将来はランダム分岐可）
        const enemy = {
            id: this.nextEnemyId++,
            hp: this.ENEMY_HP,
            distance: this.ENEMY_DISTANCE_INITIAL,
            azim,
            elev,
            spawnTime: performance.now(),
            type: 'hitodama'
        };
        
        this.enemies.push(enemy);
        
        if (this.onEnemySpawned) {
            this.onEnemySpawned(enemy);
        }
        
        console.log(`[GameWorld] 敵スポーン: id=${enemy.id}, azim=${azim.toFixed(1)}°, elev=${elev.toFixed(1)}°`);
    }
    
    /**
     * プレイヤーにダメージ
     */
    handlePlayerDamage(enemy) {
        this.playerHP = Math.max(0, this.playerHP - 1);
        this.damageCount++;
        
        console.log(`[GameWorld] 被弾: HP=${this.playerHP}, 敵id=${enemy.id}`);
        
        if (this.onPlayerDamaged) {
            this.onPlayerDamaged({ hp: this.playerHP, enemy });
        }
    }
    
    /**
     * 敵にダメージを与える
     * @returns {boolean} 敵が撃破されたかどうか
     */
    damageEnemy(enemyId, damage) {
        const enemy = this.enemies.find(e => e.id === enemyId);
        if (!enemy) return false;
        
        enemy.hp -= damage;
        
        if (enemy.hp <= 0) {
            // 敵を撃破
            this.killEnemy(enemyId);
            return true;
        }
        
        return false;
    }
    
    /**
     * 敵を撃破
     */
    killEnemy(enemyId) {
        const index = this.enemies.findIndex(e => e.id === enemyId);
        if (index === -1) return;
        
        const enemy = this.enemies[index];
        this.enemies.splice(index, 1);
        this.killCount++;
        
        // スポーン間隔短縮
        this.spawnInterval = Math.max(this.minSpawnInterval, this.spawnInterval - this.spawnIntervalDecrement);
        
        console.log(`[GameWorld] 敵撃破: id=${enemyId}, killCount=${this.killCount}, 次のスポーン=${this.spawnInterval}ms`);
        
        if (this.onEnemyKilled) {
            this.onEnemyKilled({ enemy, killCount: this.killCount });
        }
    }
    
    /**
     * 敵の方向ベクトルを取得（球面座標 -> デカルト座標）
     */
    getEnemyDirection(enemy) {
        const azimRad = enemy.azim * Math.PI / 180;
        const elevRad = enemy.elev * Math.PI / 180;
        
        const x = Math.cos(elevRad) * Math.sin(azimRad);
        const y = Math.sin(elevRad);
        const z = Math.cos(elevRad) * Math.cos(azimRad);
        
        return { x, y, z };
    }
    
    /**
     * 全敵を取得
     */
    getEnemies() {
        return this.enemies;
    }
    
    /**
     * プレイヤー情報を取得
     */
    getPlayerState() {
        return {
            hp: this.playerHP,
            maxHP: this.maxPlayerHP
        };
    }
    
    /**
     * ゲーム統計を取得
     */
    getGameStats() {
        return {
            killCount: this.killCount,
            damageCount: this.damageCount,
            gameTime: this.gameTime,
            remainingTime: Math.max(0, this.maxGameTime - this.gameTime) / 1000 // 秒
        };
    }
}
