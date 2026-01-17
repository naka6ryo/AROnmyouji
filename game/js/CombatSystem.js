/**
 * CombatSystem.js
 * 命中判定、ダメージ適用、触覚イベント生成を行うクラス
 */

export class CombatSystem {
    constructor(gameWorld, motionInterpreter) {
        this.gameWorld = gameWorld;
        this.motionInterpreter = motionInterpreter;
        
        // 命中角度閾値（仕様書の値）
        this.SWING_HIT_ANGLE = 10;  // deg
        this.OFUDA_HIT_ANGLE = 6;   // deg
        
        // 札の管理
        this.ofudas = [];
        this.OFUDA_LIFETIME = 800;  // ms
        
        // ダメージ
        this.normalDamage = 1;
        this.powerDamage = 2;
        
        // クリティカル判定
        this.CRITICAL_INTENSITY_THRESHOLD = 0.85;
        
        // 触覚イベント用最小間隔
        this.T_HIT_MIN = 150; // ms
        this.lastHitHapticTime = 0;
        
        // コールバック
        this.onHit = null;
        this.onCriticalHit = null;
        this.onOfudaFired = null;
        this.onHapticEvent = null;
    }
    
    /**
     * 更新
     */
    update(deltaTime, viewDirection) {
        // 札の更新
        const now = performance.now();
        this.ofudas = this.ofudas.filter(ofuda => {
            const age = now - ofuda.spawnTime;
            if (age >= this.OFUDA_LIFETIME) {
                return false; // 寿命切れ
            }
            
            // 命中判定
            this.checkOfudaHit(ofuda, viewDirection, now);
            return true;
        });
    }
    
    /**
     * 斬撃命中判定（軌跡ベース・極座標判定）
     */
    handleSwing(swingData) {
        const intensity = swingData.intensity;
        const trajectory = swingData.trajectory;
        const enemies = this.gameWorld.getEnemies();
        
        let hitAny = false;
        let isCritical = intensity >= this.CRITICAL_INTENSITY_THRESHOLD;
        
        // 軌跡の始点と終点を取得
        if (!trajectory || trajectory.length < 2) {
            console.warn('[Combat] 軌跡データが不足しています');
            return false;
        }
        
        const startPyr = trajectory[0];
        const endPyr = trajectory[trajectory.length - 1];
        
        // 円弧の初期半径（描画での基準）
        const arcMinRadius = 0.3;  // m
        const arcMaxRadius = 5.0;  // m
        
        for (const enemy of enemies) {
            // 敵の極座標を取得
            const enemyPitch = enemy.elev; // 仰角
            const enemyYaw = enemy.azim;   // 方位角
            const enemyDistance = enemy.distance;
            
            // 敵の角度が始点と終点の間の角度範囲に入っているかを判定
            const pitchInRange = this.isAngleInArc(startPyr.pitch, endPyr.pitch, enemyPitch);
            const yawInRange = this.isAngleInArc(startPyr.yaw, endPyr.yaw, enemyYaw);
            
            // 敵の距離が円弧の半径範囲に入っているかを判定
            const distanceInRange = enemyDistance >= arcMinRadius && enemyDistance <= arcMaxRadius;
            
            // 角度範囲内かつ距離範囲内なら命中
            if (pitchInRange && yawInRange && distanceInRange) {
                // 命中
                const damage = this.motionInterpreter.isPowerMode ? this.powerDamage : this.normalDamage;
                const killed = this.gameWorld.damageEnemy(enemy.id, damage);
                
                hitAny = true;
                
                console.log(`[Combat] 斬撃命中: 敵id=${enemy.id}, 敵方向=(pitch=${enemyPitch.toFixed(1)}°, yaw=${enemyYaw.toFixed(1)}°), 距離=${enemyDistance.toFixed(2)}m, ダメージ=${damage}, 撃破=${killed}, クリティカル=${isCritical}`);
                
                if (this.onHit) {
                    this.onHit({ enemy, damage, killed, isCritical });
                }
                
                // 触覚イベント
                this.sendHitHaptic(isCritical);
                
                break; // 1度に1体のみ命中
            }
        }
        
        return hitAny;
    }
    
    /**
     * 角度がアーク範囲内にあるかを判定
     */
    isAngleInArc(startAngle, endAngle, targetAngle) {
        // 角度差を正規化（-180〜180）
        const start = this.normalizeAngle(startAngle);
        const end = this.normalizeAngle(endAngle);
        const target = this.normalizeAngle(targetAngle);
        
        // 短い方のアークで判定
        let angleDiffStart = this.angleDiff(start, target);
        let angleDiffEnd = this.angleDiff(end, target);
        
        // アークの方向を判定
        const arcDirection = this.angleDiff(start, end);
        
        // 始点から終点への角度差
        if (arcDirection >= 0) {
            // 正方向のアーク
            return angleDiffStart >= 0 && angleDiffStart <= arcDirection;
        } else {
            // 負方向のアーク
            return angleDiffStart <= 0 && angleDiffStart >= arcDirection;
        }
    }
    
    /**
     * 角度を-180〜180に正規化
     */
    normalizeAngle(angle) {
        let normalized = angle;
        while (normalized > 180) normalized -= 360;
        while (normalized < -180) normalized += 360;
        return normalized;
    }
    
    /**
     * 札発射
     */
    fireOfuda(viewDirection) {
        const ofuda = {
            id: Math.random(),
            direction: { ...viewDirection },
            spawnTime: performance.now()
        };
        
        this.ofudas.push(ofuda);
        
        console.log(`[Combat] 札発射: 方向=${JSON.stringify(viewDirection)}`);
        
        if (this.onOfudaFired) {
            this.onOfudaFired(ofuda);
        }
        
        // 触覚イベント（術成立）
        this.sendHapticEvent('ofuda_success', 180, 15);
    }
    
    /**
     * 札の命中判定
     */
    checkOfudaHit(ofuda, viewDirection, now) {
        const enemies = this.gameWorld.getEnemies();
        
        for (const enemy of enemies) {
            const enemyDir = this.gameWorld.getEnemyDirection(enemy);
            const angle = this.calculateAngleBetween(viewDirection, enemyDir);
            
            if (angle <= this.OFUDA_HIT_ANGLE) {
                // 命中
                const damage = this.motionInterpreter.isPowerMode ? this.powerDamage : this.normalDamage;
                const killed = this.gameWorld.damageEnemy(enemy.id, damage);
                
                console.log(`[Combat] 札命中: 敵id=${enemy.id}, 角度=${angle.toFixed(2)}°, ダメージ=${damage}, 撃破=${killed}`);
                
                if (this.onHit) {
                    this.onHit({ enemy, damage, killed, isCritical: false });
                }
                
                // 札を削除
                this.ofudas = this.ofudas.filter(o => o.id !== ofuda.id);
                
                // 触覚イベント
                this.sendHitHaptic(false);
                
                break; // 1つの札は1体のみ命中
            }
        }
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
        const angleRad = Math.acos(cosTheta);
        const angleDeg = angleRad * 180 / Math.PI;
        
        return angleDeg;
    }
    
    /**
     * 命中時の触覚イベント送信
     */
    sendHitHaptic(isCritical) {
        const now = performance.now();
        
        // レート制限
        if (now - this.lastHitHapticTime < this.T_HIT_MIN) {
            console.log('[Combat] 触覚: レート制限によりスキップ');
            return;
        }
        
        this.lastHitHapticTime = now;
        
        if (isCritical) {
            // クリティカル: 2パルス
            this.sendHapticEvent('critical_hit', [
                { strength: 200, duration: 6 },
                { strength: 200, duration: 6 }
            ], 40);
        } else {
            // 通常命中: 1パルス
            this.sendHapticEvent('normal_hit', 200, 6);
        }
    }
    
    /**
     * 被弾時の触覚イベント
     */
    sendDamageHaptic() {
        this.sendHapticEvent('player_damage', 255, 12);
    }
    
    /**
     * 強化モード開始の触覚イベント
     */
    sendPowerModeHaptic() {
        this.sendHapticEvent('power_mode', [
            { strength: 220, duration: 10 },
            { strength: 220, duration: 10 }
        ], 80);
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
    
    /**
     * 札の数を取得
     */
    getOfudaCount() {
        return this.ofudas.length;
    }
}
