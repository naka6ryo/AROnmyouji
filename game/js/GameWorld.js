/**
 * GameWorld.js
 * ゲーム状態（スコア、時間、プレイヤーHP）と敵管理の統合
 */

import { EnemyManager } from './EnemyManager.js';

export class GameWorld {
    constructor() {
        // Modules
        this.enemyManager = new EnemyManager();

        // プレイヤー
        this.playerHP = 5;
        this.maxPlayerHP = 5;

        // 統計
        this.killCount = 0;
        this.damageCount = 0;

        // ゲーム時間
        this.gameTime = 0;
        this.maxGameTime = 30000; // 30秒

        // コールバック
        this.onEnemySpawned = null; // via EnemyManager
        this.onEnemyKilled = null;
        this.onPlayerDamaged = null;
        this.onGameOver = null;
        this.onGameClear = null;
    }

    /**
     * ゲーム状態をリセット (タイトルに戻る時など)
     */
    reset() {
        this.enemyManager.reset();
        this.killCount = 0;
        this.damageCount = 0;
        this.gameTime = 0;
        this.playerHP = this.maxPlayerHP;
        console.log('[GameWorld] リセット完了');
    }

    /**
     * ゲームを開始
     */
    startGame() {
        this.reset(); // 再利用

        this.enemyManager.onEnemySpawned = (enemy) => {
            if (this.onEnemySpawned) this.onEnemySpawned(enemy);
        };

        console.log('[GameWorld] ゲーム開始');
    }

    /**
     * 更新
     */
    update(deltaTime) {
        this.gameTime += deltaTime;

        // 終了判定
        if (this.playerHP <= 0) {
            if (this.onGameOver) this.onGameOver({ reason: 'hp_zero', killCount: this.killCount });
            return;
        }

        if (this.gameTime >= this.maxGameTime) {
            if (this.onGameClear) this.onGameClear({ killCount: this.killCount, time: this.gameTime });
            return;
        }

        // 敵管理更新
        const remainingSecs = Math.max(0, (this.maxGameTime - this.gameTime) / 1000);
        this.enemyManager.update(deltaTime, (enemy) => {
            this.handlePlayerDamage(enemy);
        }, remainingSecs, this.maxGameTime / 1000);
    }

    /**
     * プレイヤーにダメージ
     */
    handlePlayerDamage(enemy) {
        this.playerHP = Math.max(0, this.playerHP - 1);
        this.damageCount++;

        console.log(`[GameWorld] 被弾: HP=${this.playerHP}`);

        if (this.onPlayerDamaged) {
            this.onPlayerDamaged({ hp: this.playerHP, enemy });
        }
    }

    /**
     * 敵にダメージを与える
     */
    damageEnemy(enemyId, damage) {
        const result = this.enemyManager.damageEnemy(enemyId, damage);

        if (result.killed) {
            this.killCount++;
            console.log(`[GameWorld] 撃破: count=${this.killCount}`);

            if (this.onEnemyKilled) {
                this.onEnemyKilled({ enemy: result.enemy, killCount: this.killCount });
            }
            return true;
        }
        return false;
    }

    /**
     * 敵の方向ベクトルを取得（Utility Wrapper）
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
        return this.enemyManager.getEnemies();
    }

    getPlayerState() {
        return {
            hp: this.playerHP,
            maxHP: this.maxPlayerHP
        };
    }

    getGameStats() {
        return {
            killCount: this.killCount,
            damageCount: this.damageCount,
            gameTime: this.gameTime,
            remainingTime: Math.max(0, this.maxGameTime - this.gameTime) / 1000
        };
    }
}
