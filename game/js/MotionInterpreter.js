/**
 * MotionInterpreter.js
 * キャリブレーション、斬撃検出、円ジェスチャ、強化モード判定を行うクラス
 */

export class MotionInterpreter {
    constructor() {
        // キャリブレーション
        this.pyr0 = null; // 基準姿勢 {pitch, yaw, roll}
        this.isCalibrated = false;
        
        // 斬撃検出の閾値（仕様書の初期値）
        this.A_START = 0.25;      // g
        this.A_END = 0.18;        // g
        this.DA_START = 0.08;     // g
        this.T_MIN = 60;          // ms
        this.T_COOLDOWN = 220;    // ms
        this.A_MAX = 0.60;        // g (強度正規化上限)
        
        // 斬撃状態機械
        this.swingState = 'Idle'; // Idle, SwingActive, Cooldown
        this.swingStartTime = 0;
        this.cooldownEndTime = 0;
        this.lastSwingIntensity = 0;
        
        // 斬撃軌跡記録（SwingActive中の姿勢角）
        this.swingTrajectory = [];
        
        // 前フレームの加速度大きさ
        this.prevAMag = 0;
        
        // 円ジェスチャ用リングバッファ
        this.gestureBuffer = [];
        this.GESTURE_WINDOW = 1500; // ms（0.6秒〜1.5秒の窓）
        this.GESTURE_MIN_DURATION = 600; // ms
        
        // 円ジェスチャの閾値
        this.CIRCLE_MIN_LENGTH = 120;     // deg
        this.CIRCLE_MAX_CLOSURE = 25;     // deg
        this.CIRCLE_MIN_ROTATION = 260;   // deg
        this.CIRCLE_COOLDOWN = 700;       // ms
        this.lastCircleTime = 0;
        
        // 強化モード
        this.isPowerMode = false;
        this.powerModeEndTime = 0;
        this.POWER_MODE_DURATION = 10000; // 10秒
        
        // 強化モード発動用（1.2秒以内に斬撃3回）
        this.recentSwings = [];
        this.POWER_SWING_WINDOW = 1200;   // ms
        this.POWER_MIN_INTENSITY = 0.5;
        
        // コールバック
        this.onSwingDetected = null;
        this.onCircleDetected = null;
        this.onPowerModeActivated = null;
    }
    
    /**
     * キャリブレーションを実行
     */
    calibrate(pitch_deg, yaw_deg, roll_deg) {
        this.pyr0 = {
            pitch: pitch_deg,
            yaw: yaw_deg,
            roll: roll_deg
        };
        this.isCalibrated = true;
        console.log('[MotionInterpreter] キャリブレーション完了:', this.pyr0);
    }
    
    /**
     * 相対姿勢を計算（unwrap）
     */
    getRelativePYR(pitch_deg, yaw_deg, roll_deg) {
        if (!this.isCalibrated) {
            return { pitch: pitch_deg, yaw: yaw_deg, roll: roll_deg };
        }
        
        return {
            pitch: this.unwrapAngle(pitch_deg - this.pyr0.pitch),
            yaw: this.unwrapAngle(yaw_deg - this.pyr0.yaw),
            roll: this.unwrapAngle(roll_deg - this.pyr0.roll)
        };
    }
    
    /**
     * 角度を-180〜180にラップ
     */
    unwrapAngle(angle) {
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
    }
    
    /**
     * フレームを更新
     */
    update(frame) {
        const now = frame.timestamp;
        
        // 斬撃検出
        this.updateSwingDetection(frame, now);
        
        // 円ジェスチャ検出
        this.updateCircleGesture(frame, now);
        
        // 強化モード更新
        this.updatePowerMode(now);
        
        // 前フレーム更新
        this.prevAMag = frame.a_mag;
    }
    
    /**
     * 斬撃検出の更新
     */
    updateSwingDetection(frame, now) {
        const a_mag = frame.a_mag;
        const da_mag = a_mag - this.prevAMag;
        
        switch (this.swingState) {
            case 'Idle':
                // SwingActive発火条件
                if (a_mag >= this.A_START && da_mag >= this.DA_START && now >= this.cooldownEndTime) {
                    this.swingState = 'SwingActive';
                    this.swingStartTime = now;
                    this.swingTrajectory = []; // 軌跡記録開始
                    console.log('[Swing] SwingActive開始');
                }
                break;
                
            case 'SwingActive':
                // 軌跡を記録（相対姿勢角）
                const pyr_rel = this.getRelativePYR(frame.pitch_deg, frame.yaw_deg, frame.roll_deg);
                this.swingTrajectory.push({
                    pitch: pyr_rel.pitch,
                    yaw: pyr_rel.yaw,
                    roll: pyr_rel.roll,
                    timestamp: now
                });
                
                // Cooldown遷移条件
                const duration = now - this.swingStartTime;
                if (a_mag <= this.A_END && duration >= this.T_MIN) {
                    // 斬撃強度を計算
                    const intensity = Math.max(0, Math.min(1, (a_mag - this.A_START) / (this.A_MAX - this.A_START)));
                    this.lastSwingIntensity = intensity;
                    
                    // 斬撃方向ベクトルを計算
                    const attackDir = this.pyrToDirection(pyr_rel.pitch, pyr_rel.yaw);
                    
                    // コールバック（軌跡データを含める）
                    if (this.onSwingDetected) {
                        this.onSwingDetected({
                            intensity,
                            direction: attackDir,
                            trajectory: [...this.swingTrajectory], // 軌跡データ
                            timestamp: now
                        });
                    }
                    
                    // 強化モード判定用に記録
                    this.recentSwings.push({ intensity, timestamp: now });
                    this.checkPowerModeActivation(now);
                    
                    // Cooldown状態へ
                    this.swingState = 'Cooldown';
                    this.cooldownEndTime = now + this.T_COOLDOWN;
                    console.log(`[Swing] 斬撃検出: intensity=${intensity.toFixed(2)}, 軌跡点数=${this.swingTrajectory.length}`);
                }
                break;
                
            case 'Cooldown':
                // Idle遷移条件
                if (now >= this.cooldownEndTime) {
                    this.swingState = 'Idle';
                    console.log('[Swing] Idleへ復帰');
                }
                break;
        }
    }
    
    /**
     * 円ジェスチャの更新
     */
    updateCircleGesture(frame, now) {
        // リングバッファに追加
        this.gestureBuffer.push({
            pitch: frame.pitch_deg,
            yaw: frame.yaw_deg,
            timestamp: now
        });
        
        // 古いデータを削除
        this.gestureBuffer = this.gestureBuffer.filter(p => now - p.timestamp <= this.GESTURE_WINDOW);
        
        // 最小継続時間チェック
        if (this.gestureBuffer.length < 2) return;
        
        const duration = now - this.gestureBuffer[0].timestamp;
        if (duration < this.GESTURE_MIN_DURATION) return;
        
        // クールダウンチェック
        if (now - this.lastCircleTime < this.CIRCLE_COOLDOWN) return;
        
        // 特徴量計算
        const L = this.calculateTrajectoryLength();
        const d_se = this.calculateClosureDistance();
        const R = this.calculateRotation();
        
        // 成立条件チェック
        if (L >= this.CIRCLE_MIN_LENGTH && d_se <= this.CIRCLE_MAX_CLOSURE && Math.abs(R) >= this.CIRCLE_MIN_ROTATION) {
            console.log(`[Circle] 円ジェスチャ成立: L=${L.toFixed(1)}, d_se=${d_se.toFixed(1)}, R=${R.toFixed(1)}`);
            
            if (this.onCircleDetected) {
                this.onCircleDetected({ timestamp: now });
            }
            
            this.lastCircleTime = now;
            this.gestureBuffer = []; // バッファクリア
        }
    }
    
    /**
     * 軌跡長を計算
     */
    calculateTrajectoryLength() {
        let length = 0;
        for (let i = 1; i < this.gestureBuffer.length; i++) {
            const p1 = this.gestureBuffer[i - 1];
            const p2 = this.gestureBuffer[i];
            const dPitch = p2.pitch - p1.pitch;
            const dYaw = p2.yaw - p1.yaw;
            length += Math.sqrt(dPitch * dPitch + dYaw * dYaw);
        }
        return length;
    }
    
    /**
     * 閉曲線度（開始点と終了点の距離）
     */
    calculateClosureDistance() {
        if (this.gestureBuffer.length < 2) return Infinity;
        
        const start = this.gestureBuffer[0];
        const end = this.gestureBuffer[this.gestureBuffer.length - 1];
        const dPitch = end.pitch - start.pitch;
        const dYaw = end.yaw - start.yaw;
        return Math.sqrt(dPitch * dPitch + dYaw * dYaw);
    }
    
    /**
     * 回転量（符号付き角速度の累積）
     */
    calculateRotation() {
        let rotation = 0;
        for (let i = 1; i < this.gestureBuffer.length; i++) {
            const p1 = this.gestureBuffer[i - 1];
            const p2 = this.gestureBuffer[i];
            const dYaw = this.unwrapAngle(p2.yaw - p1.yaw);
            rotation += dYaw;
        }
        return rotation;
    }
    
    /**
     * 強化モード発動チェック
     */
    checkPowerModeActivation(now) {
        // 古いスイングを削除
        this.recentSwings = this.recentSwings.filter(s => now - s.timestamp <= this.POWER_SWING_WINDOW);
        
        // 条件: 1.2秒以内に3回以上 かつ 平均強度0.5以上
        if (this.recentSwings.length >= 3) {
            const avgIntensity = this.recentSwings.reduce((sum, s) => sum + s.intensity, 0) / this.recentSwings.length;
            
            if (avgIntensity >= this.POWER_MIN_INTENSITY) {
                console.log(`[PowerMode] 強化モード発動: 平均強度=${avgIntensity.toFixed(2)}`);
                
                this.isPowerMode = true;
                this.powerModeEndTime = now + this.POWER_MODE_DURATION;
                
                if (this.onPowerModeActivated) {
                    this.onPowerModeActivated({ timestamp: now });
                }
                
                // スイング履歴をクリア
                this.recentSwings = [];
            }
        }
    }
    
    /**
     * 強化モードの更新
     */
    updatePowerMode(now) {
        if (this.isPowerMode && now >= this.powerModeEndTime) {
            this.isPowerMode = false;
            console.log('[PowerMode] 強化モード終了');
        }
    }
    
    /**
     * 姿勢角から方向ベクトルを生成（簡易版）
     */
    pyrToDirection(pitch, yaw) {
        // pitch: 上下（deg）
        // yaw: 左右（deg）
        const pitchRad = pitch * Math.PI / 180;
        const yawRad = yaw * Math.PI / 180;
        
        // 球面座標 -> デカルト座標
        const x = Math.cos(pitchRad) * Math.sin(yawRad);
        const y = Math.sin(pitchRad);
        const z = Math.cos(pitchRad) * Math.cos(yawRad);
        
        return { x, y, z };
    }
    
    /**
     * 斬撃状態を取得
     */
    getSwingState() {
        return {
            state: this.swingState,
            cooldownRemaining: Math.max(0, this.cooldownEndTime - performance.now()),
            lastIntensity: this.lastSwingIntensity
        };
    }
    
    /**
     * 強化モード状態を取得
     */
    getPowerModeState() {
        return {
            active: this.isPowerMode,
            remaining: this.isPowerMode ? Math.max(0, this.powerModeEndTime - performance.now()) : 0
        };
    }
    
    /**
     * 円ジェスチャのデバッグ情報を取得
     */
    getCircleDebugInfo() {
        if (this.gestureBuffer.length < 2) {
            return { valid: false };
        }
        
        return {
            valid: true,
            length: this.calculateTrajectoryLength(),
            closure: this.calculateClosureDistance(),
            rotation: this.calculateRotation(),
            bufferSize: this.gestureBuffer.length
        };
    }
}
