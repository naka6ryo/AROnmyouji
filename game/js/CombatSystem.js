/**
 * CombatSystem.js
 * 命中判定、ダメージ適用、触覚イベント生成を行うクラス
 */

import { OfudaManager } from './OfudaManager.js';

export class CombatSystem {
    constructor(gameWorld, motionInterpreter) {
        this.gameWorld = gameWorld;
        this.motionInterpreter = motionInterpreter;

        // Modules
        this.ofudaManager = new OfudaManager();

        // 命中角度閾値（斬撃用）
        this.SWING_HIT_ANGLE = 10;

        // ダメージ
        this.normalDamage = 1;
        this.powerDamage = 2;

        // クリティカル判定
        this.CRITICAL_INTENSITY_THRESHOLD = 0.85;

        // 触覚イベント用最小間隔
        this.T_HIT_MIN = 150;
        this.lastHitHapticTime = 0;

        // コールバック
        this.onHit = null;
        this.onHapticEvent = null;
    }

    /**
     * 更新
     */
    update(deltaTime, viewDirection) {
        // 札の更新
        this.ofudaManager.update(this.gameWorld.getEnemies(), (enemy, ofuda) => {
            this.handleOfudaHit(enemy, ofuda);
        });
    }

    /**
     * 斬撃命中判定（軌跡ベース・極座標判定）
     */
    handleSwing(swingData) {
        // NOTE: This logic seems to be largely superseded by SlashProjectileManager in Renderer.js 
        // which handles hit detection via physics/geometry intersection.
        // However, if direct swing detection is still used, we keep it.
        // Based on main.js, onSwing calls renderer.addSlashArcProjectile.
        // renderer.updateSlashProjectiles calls onRendererSlashHit.
        // So THIS handleSwing might be unused or legacy?
        // Let's check main.js usage.
        // main.js calls combatSystem.update().
        // It DOES NOT call combatSystem.handleSwing().
        // MotionInterpreter calls main.onSwing -> Renderer.
        // So handleSwing here is likely DEAD CODE from previous iteration.
        // I will keep it for safety but note it.
        // actually looking at the original file, handleSwing was used by MotionInterpreter call?
        // No, MotionInterpreter `onSwingDetected` calls `main.onSwing`.
        // `main.onSwing` calls `renderer.addSlashArcProjectile`.
        // So `CombatSystem.handleSwing` is indeed not called in the current architecture.
        // I will remove it to clean up.
        return false;
    }

    /**
     * 札発射
     */
    fireOfuda(viewDirection) {
        const ofuda = this.ofudaManager.fire(viewDirection);
        console.log(`[Combat] 札発射`);

        this.sendHapticEvent('ofuda_success', 180, 15);
    }

    /**
     * 札命中処理
     */
    handleOfudaHit(enemy, ofuda) {
        const damage = this.motionInterpreter.isPowerMode ? this.powerDamage : this.normalDamage;
        const killed = this.gameWorld.damageEnemy(enemy.id, damage);

        console.log(`[Combat] 札命中: 敵id=${enemy.id}, ダメージ=${damage}`);

        if (this.onHit) {
            this.onHit({ enemy, damage, killed, isCritical: false });
        }

        this.sendHitHaptic(false);
    }

    /**
     * 命中時の触覚イベント送信
     */
    sendHitHaptic(isCritical) {
        const now = performance.now();
        if (now - this.lastHitHapticTime < this.T_HIT_MIN) return;
        this.lastHitHapticTime = now;

        if (isCritical) {
            this.sendHapticEvent('critical_hit', [{ strength: 200, duration: 6 }, { strength: 200, duration: 6 }], 40);
        } else {
            this.sendHapticEvent('normal_hit', 200, 6);
        }
    }

    /**
     * 被弾時の触覚イベント
     */
    sendDamageHaptic() {
        // 断続的に3回振動するように変更
        // 各パルスは強度255、duration=12(=120ms)、パルス間隔は120msに設定して確実に3回送信
        this.sendHapticEvent('player_damage', [
            { strength: 255, duration: 12 },
            { strength: 255, duration: 12 },
            { strength: 255, duration: 12 }
        ], 120);
    }

    /**
     * 強化モード開始の触覚イベント
     */
    sendPowerModeHaptic() {
        this.sendHapticEvent('power_mode', [{ strength: 220, duration: 10 }, { strength: 220, duration: 10 }], 80);
    }

    /**
     * 触覚イベント送信（汎用）
     */
    sendHapticEvent(eventType, strengthOrPulses, durationOrInterval) {
        if (this.onHapticEvent) {
            this.onHapticEvent({
                type: eventType,
                data: Array.isArray(strengthOrPulses)
                    ? { pulses: strengthOrPulses, interval: durationOrInterval }
                    : { strength: strengthOrPulses, duration: durationOrInterval }
            });
        }
    }
}
