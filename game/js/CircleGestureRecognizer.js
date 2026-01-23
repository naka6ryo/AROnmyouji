/**
 * CircleGestureRecognizer.js
 * 姿勢角の履歴から円ジェスチャを検出するクラス
 */

export class CircleGestureRecognizer {
    constructor() {
        this.buffer = [];
        this.GESTURE_WINDOW = 1500;
        this.GESTURE_MIN_DURATION = 600;
        this.CIRCLE_MIN_LENGTH = 120;
        this.CIRCLE_MAX_CLOSURE = 25;
        this.CIRCLE_MIN_ROTATION = 260;
        this.CIRCLE_COOLDOWN = 700;

        this.lastDetectedTime = 0;

        this.onCircleDetected = null;
    }

    update(frame, now) {
        this.buffer.push({
            pitch: frame.pitch_deg,
            yaw: frame.yaw_deg,
            timestamp: now
        });

        // フィルタ（時間枠）
        this.buffer = this.buffer.filter(p => now - p.timestamp <= this.GESTURE_WINDOW);

        // チェック
        if (this.buffer.length < 2) return;
        const duration = now - this.buffer[0].timestamp;
        if (duration < this.GESTURE_MIN_DURATION) return;
        if (now - this.lastDetectedTime < this.CIRCLE_COOLDOWN) return;

        // 特徴量
        const L = this.calculateTrajectoryLength();
        const d_se = this.calculateClosureDistance();
        const R = this.calculateRotation();

        // 判定
        if (L >= this.CIRCLE_MIN_LENGTH && d_se <= this.CIRCLE_MAX_CLOSURE && Math.abs(R) >= this.CIRCLE_MIN_ROTATION) {
            console.log(`[Circle] Detected: L=${L.toFixed(1)}, d_se=${d_se.toFixed(1)}, R=${R.toFixed(1)}`);
            this.lastDetectedTime = now;
            this.buffer = [];

            if (this.onCircleDetected) {
                this.onCircleDetected({ timestamp: now, L, d_se, R });
            }
        }
    }

    calculateTrajectoryLength() {
        let length = 0;
        for (let i = 1; i < this.buffer.length; i++) {
            const p1 = this.buffer[i - 1];
            const p2 = this.buffer[i];
            const dPitch = p2.pitch - p1.pitch;
            const dYaw = p2.yaw - p1.yaw;
            length += Math.sqrt(dPitch * dPitch + dYaw * dYaw);
        }
        return length;
    }

    calculateClosureDistance() {
        if (this.buffer.length < 2) return Infinity;
        const start = this.buffer[0];
        const end = this.buffer[this.buffer.length - 1];
        const dPitch = end.pitch - start.pitch;
        const dYaw = end.yaw - start.yaw;
        return Math.sqrt(dPitch * dPitch + dYaw * dYaw);
    }

    calculateRotation() {
        let rotation = 0;
        for (let i = 1; i < this.buffer.length; i++) {
            const p1 = this.buffer[i - 1];
            const p2 = this.buffer[i];
            const dYaw = this.unwrapAngle(p2.yaw - p1.yaw);
            rotation += dYaw;
        }
        return rotation;
    }

    unwrapAngle(angle) {
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
    }

    getDebugInfo() {
        if (this.buffer.length < 2) return { valid: false };
        return {
            valid: true,
            length: this.calculateTrajectoryLength(),
            closure: this.calculateClosureDistance(),
            rotation: this.calculateRotation(),
            bufferSize: this.buffer.length
        };
    }

    reset() {
        this.buffer = [];
        this.lastDetectedTime = 0;
        console.log('[CircleGestureRecognizer] Reset executed');
    }
}
