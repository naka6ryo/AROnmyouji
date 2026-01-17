/**
 * EnemyManager.js
 * 敵のスポーン、管理、移動更新を行うクラス
 */

export class EnemyManager {
    constructor() {
        this.enemies = [];
        this.nextEnemyId = 0;

        // 敵仕様
        this.ENEMY_HP = 1;
        this.ENEMY_DISTANCE_INITIAL = 3.5;
        this.ENEMY_APPROACH_SPEED = 0.45;
        this.ENEMY_HIT_DISTANCE = 0.9;

        // スポーン制御
        this.spawnInterval = 2700;
        this.minSpawnInterval = 1200;
        this.spawnIntervalDecrement = 100;
        this.nextSpawnTime = 0;

        // コールバック
        this.onEnemySpawned = null;
    }

    /**
     * 初期化
     */
    reset() {
        this.enemies = [];
        this.spawnInterval = 2200;
        this.nextSpawnTime = performance.now() + 1000;
    }

    /**
     * 更新
     */
    update(deltaTime, onPlayerDamage) {
        const now = performance.now();

        // スポーン
        if (now >= this.nextSpawnTime) {
            this.spawnEnemy();
            this.nextSpawnTime = now + this.spawnInterval;
        }

        // 移動・攻撃判定
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];

            // 接近
            enemy.distance -= this.ENEMY_APPROACH_SPEED * (deltaTime / 1000);

            // 被弾判定
            if (enemy.distance <= this.ENEMY_HIT_DISTANCE) {
                if (onPlayerDamage) {
                    onPlayerDamage(enemy);
                }
                this.enemies.splice(i, 1);
            }
        }
    }

    /**
     * 敵をスポーン
     */
    spawnEnemy() {
        const azim = Math.random() * 360;
        const elev = Math.random() * 60;

        const enemy = {
            id: this.nextEnemyId++,
            hp: this.ENEMY_HP,
            distance: this.ENEMY_DISTANCE_INITIAL,
            azim,
            elev,
            spawnTime: performance.now()
        };

        this.enemies.push(enemy);

        if (this.onEnemySpawned) {
            this.onEnemySpawned(enemy);
        }

        console.log(`[EnemyManager] Spawn: id=${enemy.id}`);
    }

    /**
     * ダメージ処理
     */
    damageEnemy(enemyId, damage) {
        const index = this.enemies.findIndex(e => e.id === enemyId);
        if (index === -1) return { killed: false, enemy: null };

        const enemy = this.enemies[index];
        enemy.hp -= damage;

        if (enemy.hp <= 0) {
            this.enemies.splice(index, 1);

            // スポーン間隔短縮
            this.spawnInterval = Math.max(this.minSpawnInterval, this.spawnInterval - this.spawnIntervalDecrement);

            return { killed: true, enemy };
        }
        return { killed: false, enemy };
    }

    getEnemies() {
        return this.enemies;
    }
}
