/**
 * OfudaManager.js
 * 札（Ofuda）の生成・更新・命中判定を行うクラス
 */

export class OfudaManager {
    constructor() {
        this.ofudas = [];
        this.OFUDA_LIFETIME = 800;  // ms
        this.OFUDA_HIT_ANGLE = 6;   // deg
    }

    /**
     * 札を発射
     */
    fire(viewDirection) {
        const ofuda = {
            id: Math.random(),
            direction: { ...viewDirection },
            spawnTime: performance.now()
        };
        this.ofudas.push(ofuda);
        return ofuda;
    }

    /**
     * 更新
     */
    update(enemies, onHitCallback) {
        const now = performance.now();

        this.ofudas = this.ofudas.filter(ofuda => {
            const age = now - ofuda.spawnTime;
            if (age >= this.OFUDA_LIFETIME) {
                return false; // Time out
            }

            // Hit detection
            const hitEnemy = this.checkHit(ofuda, enemies);
            if (hitEnemy) {
                if (onHitCallback) {
                    onHitCallback(hitEnemy, ofuda);
                }
                return false; // Remove on hit
            }
            return true;
        });
    }

    /**
     * 命中判定
     */
    checkHit(ofuda, enemies) {
        for (const enemy of enemies) {
            const enemyDir = this.getEnemyDirection(enemy);
            const angle = this.calculateAngleBetween(ofuda.direction, enemyDir);

            if (angle <= this.OFUDA_HIT_ANGLE) {
                return enemy;
            }
        }
        return null;
    }

    /**
     * 敵の方向ベクトルを取得（Utility）
     * Note: Should match GameWorld logic or receive pre-calculated directions?
     * For simplicity, duplicated here or passed in? 
     * Better to pass getEnemyDirection function or use shared utility.
     * Let's include calculation here for self-containment if it's simple math.
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
     * 2つのベクトル間の角度を計算（度）
     */
    calculateAngleBetween(v1, v2) {
        const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

        if (mag1 === 0 || mag2 === 0) return 180;

        const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
        return Math.acos(cosTheta) * 180 / Math.PI;
    }
}
