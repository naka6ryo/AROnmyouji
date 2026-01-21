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
        // 初期出現距離: 元の3.5を1.5倍に設定
        this.ENEMY_DISTANCE_INITIAL = 3.5 * 1.5;
        this.ENEMY_APPROACH_SPEED = 0.45;
        this.ENEMY_MAX_SPEED_MULTIPLIER = 1.5; // 最大で初期速度の1.5倍
        this.ENEMY_HIT_DISTANCE = 0.9;

        // スポーン制御 (ms) -- 頻度を上げるため短縮
        this.minSpawnInterval = 900; // 0.9s
        this.spawnIntervalDecrement = 100;
        this.targetIntervalAt5s = 1200; // 残り5秒で目標となる間隔（1.2s）
        this.initialSpawnBase = 2500 + Math.random() * 1000; // 2500-3500ms のランダム初期基準
        this.spawnInterval = this.initialSpawnBase;
        this.nextSpawnTime = 0;

        // コールバック
        this.onEnemySpawned = null;
    }

    /**
     * 初期化
     */
    reset() {
        this.enemies = [];
        // 初期出現間隔の基準を再生成し、最初の出現をその間隔後に設定
        this.initialSpawnBase = 2500 + Math.random() * 1000;
        this.spawnInterval = this.initialSpawnBase;
        // カウントダウン終了直後に1体即時スポーンさせるため即時に設定
        this.nextSpawnTime = performance.now();
    }

    /**
     * 更新
     */
    update(deltaTime, onPlayerDamage, remainingSeconds, maxGameSeconds) {
        const now = performance.now();

        // スポーン
        if (now >= this.nextSpawnTime) {
            // spawn 時に残り時間を渡して、その敵の接近速度を決める
            this.spawnEnemy(remainingSeconds, maxGameSeconds);

            // 次の間隔を計算（残り時間情報があれば補間で短くしていく）
            if (typeof remainingSeconds === 'number' && typeof maxGameSeconds === 'number' && maxGameSeconds > 5) {
                const nextInterval = this.computeSpawnInterval(remainingSeconds, maxGameSeconds);
                this.spawnInterval = Math.max(this.minSpawnInterval, Math.round(nextInterval));
            }
            this.nextSpawnTime = now + this.spawnInterval;
        }

        // 移動・攻撃判定
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];

            // 接近（各敵が持つ速度を使用）
            const approachSpeed = enemy.approachSpeed || this.ENEMY_APPROACH_SPEED;
            enemy.distance -= approachSpeed * (deltaTime / 1000);

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
    spawnEnemy(remainingSeconds, maxGameSeconds) {
        const azim = Math.random() * 360;
        const elev = Math.random() * 60;

        // 速度倍率を計算して敵の接近速度を決定
        const speedMultiplier = this.computeSpeedMultiplier(remainingSeconds, maxGameSeconds);
        const approachSpeed = this.ENEMY_APPROACH_SPEED * speedMultiplier;

        const enemy = {
            id: this.nextEnemyId++,
            hp: this.ENEMY_HP,
            distance: this.ENEMY_DISTANCE_INITIAL,
            azim,
            elev,
            approachSpeed,
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

    /**
     * 残り時間に応じて次の出現間隔（ms）を計算する
     * - 残り5秒以下: `targetIntervalAt5s`
     * - 残り5秒より多い場合: 線形補間で `initialSpawnBase` から `targetIntervalAt5s` へ変化
     */
    computeSpawnInterval(remainingSeconds, maxGameSeconds) {
        if (remainingSeconds <= 5) return this.targetIntervalAt5s;

        const clampedMax = Math.max(5.0001, maxGameSeconds);
        const factor = (remainingSeconds - 5) / (clampedMax - 5);
        const base = this.initialSpawnBase;
        const target = this.targetIntervalAt5s;

        // 線形補間
        let interval = target + factor * (base - target);

        // 少しランダム性を持たせる（約 -15% 〜 +5%）
        const jitter = 0.85 + Math.random() * 0.2;
        interval = interval * jitter;

        return Math.max(this.minSpawnInterval, interval);
    }

    getEnemies() {
        return this.enemies;
    }

    /**
     * 残り時間に応じた速度倍率を計算
     * - 残り5秒以下: ENEMY_MAX_SPEED_MULTIPLIER
     * - それ以外: 線形に 1.0 -> ENEMY_MAX_SPEED_MULTIPLIER
     */
    computeSpeedMultiplier(remainingSeconds, maxGameSeconds) {
        if (typeof remainingSeconds !== 'number' || typeof maxGameSeconds !== 'number' || maxGameSeconds <= 5) {
            return 1.0;
        }
        if (remainingSeconds <= 5) return this.ENEMY_MAX_SPEED_MULTIPLIER;

        const factor = (remainingSeconds - 5) / (maxGameSeconds - 5); // 1.0 -> 0.0
        const mult = 1.0 + (1.0 - factor) * (this.ENEMY_MAX_SPEED_MULTIPLIER - 1.0);
        return Math.max(1.0, mult);
    }
}
