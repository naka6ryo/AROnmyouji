/**
 * MotionInterpreter.js
 * キャリブレーション、スイング検出、円ジェスチャ検出、強化モード判定を統合
 */

import { SwingDetector } from './SwingDetector.js';
import { CircleGestureRecognizer } from './CircleGestureRecognizer.js';

export class MotionInterpreter {
    constructor() {
        // Sub-modules
        this.swingDetector = new SwingDetector();
        this.circleRecognizer = new CircleGestureRecognizer();

        // Calibration
        this.pyr0 = null;
        this.isCalibrated = false;

        // Power Mode
        this.isPowerMode = false;
        this.powerModeEndTime = 0;
        this.POWER_MODE_DURATION = 10000;

        // Power Mode Activation Logic
        this.recentSwings = [];
        this.POWER_SWING_WINDOW = 1200;
        this.POWER_MIN_INTENSITY = 0.5;

        // Callbacks
        this.onSwingDetected = null;
        this.onCircleDetected = null;
        this.onPowerModeActivated = null;
        this.onSwingTracerUpdate = null;
        this.onSwingStarted = null;

        // Internal wiring
        this.setupDetectorCallbacks();
    }

    setupDetectorCallbacks() {
        // Swing
        this.swingDetector.onSwingStarted = () => {
            if (this.onSwingStarted) this.onSwingStarted();
        };

        this.swingDetector.onTrajectoryUpdate = (trajectory) => {
            if (this.onSwingTracerUpdate) this.onSwingTracerUpdate(trajectory);
        };

        this.swingDetector.onSwingDetected = (swing) => {
            // Power Mode Check
            this.recordSwingForPowerMode(swing.intensity, swing.timestamp);

            // Forward event
            if (this.onSwingDetected) {
                this.onSwingDetected(swing);
            }
        };

        // Circle
        this.circleRecognizer.onCircleDetected = (circle) => {
            if (this.onCircleDetected) {
                this.onCircleDetected(circle);
            }
        };
    }

    calibrate(pitch_deg, yaw_deg, roll_deg) {
        this.pyr0 = { pitch: pitch_deg, yaw: yaw_deg, roll: roll_deg };
        this.isCalibrated = true;
        console.log('[MotionInterpreter] Calibrated:', this.pyr0);
    }

    update(frame) {
        const now = frame.timestamp;

        // 相対姿勢計算
        const relativePYR = this.getRelativePYR(frame.pitch_deg, frame.yaw_deg, frame.roll_deg);

        // Detectors update
        this.swingDetector.update(frame, now, relativePYR);
        this.circleRecognizer.update(frame, now);

        // Power Mode Update
        if (this.isPowerMode && now >= this.powerModeEndTime) {
            this.isPowerMode = false;
            console.log('[MotionInterpreter] Power Mode Ended');
        }
    }

    getRelativePYR(pitch, yaw, roll) {
        if (!this.isCalibrated) return { pitch, yaw, roll };
        return {
            pitch: this.unwrapAngle(pitch - this.pyr0.pitch),
            yaw: this.unwrapAngle(yaw - this.pyr0.yaw),
            roll: this.unwrapAngle(roll - this.pyr0.roll)
        };
    }

    unwrapAngle(angle) {
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
    }

    recordSwingForPowerMode(intensity, now) {
        // Filter old
        this.recentSwings = this.recentSwings.filter(s => now - s.timestamp <= this.POWER_SWING_WINDOW);

        // Add new
        this.recentSwings.push({ intensity, timestamp: now });

        // Check activation
        if (this.recentSwings.length >= 3) {
            const avg = this.recentSwings.reduce((sum, s) => sum + s.intensity, 0) / this.recentSwings.length;
            if (avg >= this.POWER_MIN_INTENSITY) {
                this.isPowerMode = true;
                this.powerModeEndTime = now + this.POWER_MODE_DURATION;
                this.recentSwings = []; // Reset

                if (this.onPowerModeActivated) {
                    this.onPowerModeActivated({ timestamp: now });
                }
            }
        }
    }

    getSwingState() {
        return {
            state: this.swingDetector.state,
            cooldownRemaining: Math.max(0, this.swingDetector.cooldownEndTime - performance.now()),
            lastIntensity: this.swingDetector.lastIntensity
        };
    }

    getPowerModeState() {
        return {
            active: this.isPowerMode,
            remaining: this.isPowerMode ? Math.max(0, this.powerModeEndTime - performance.now()) : 0
        };
    }

    getCircleDebugInfo() {
        return this.circleRecognizer.getDebugInfo();
    }
}
