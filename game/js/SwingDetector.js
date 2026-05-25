/**
 * SwingDetector.js
 * Detects slash swings from acceleration and controller pitch/yaw/roll.
 */

export class SwingDetector {
    constructor() {
        // Thresholds
        this.A_START = 0.60;      // g
        this.A_END = 0.60;        // g
        this.DA_START = 0.10;     // g
        this.T_MIN = 60;          // ms
        this.T_COOLDOWN = 220;    // ms
        this.A_MAX = 1.00;        // g

        // Multi-slash split thresholds
        this.SHARP_TURN_ANGLE_DEG = 150;
        this.TURN_VECTOR_MIN_DEG = 4;
        this.MIN_SPLIT_INTERVAL = 60;

        // State
        this.state = 'Idle'; // Idle, SwingActive, Cooldown
        this.startTime = 0;
        this.cooldownEndTime = 0;
        this.lastIntensity = 0;

        this.trajectory = [];
        this.prevAMag = 0;
        this.peakAMag = 0;

        // Callbacks
        this.onSwingStarted = null;
        this.onSwingDetected = null;
        this.onTrajectoryUpdate = null;
        this.onSharpTurnSwingDetected = null;
    }

    update(frame, now, relativePYR) {
        const a_mag = frame.a_mag;
        const da_mag = a_mag - this.prevAMag;

        switch (this.state) {
            case 'Idle':
                if (a_mag >= this.A_START && da_mag >= this.DA_START && now >= this.cooldownEndTime) {
                    this.startSwing(now, a_mag);
                }
                break;

            case 'SwingActive':
                this.updateActive(frame, now, relativePYR, a_mag);
                break;

            case 'Cooldown':
                if (now >= this.cooldownEndTime) {
                    this.state = 'Idle';
                    console.log('[Swing] Returned to Idle');
                }
                break;
        }

        this.prevAMag = a_mag;
    }

    startSwing(now, startAMag = 0) {
        this.state = 'SwingActive';
        this.startTime = now;
        this.trajectory = [];
        this.peakAMag = startAMag;

        if (this.onSwingStarted) {
            this.onSwingStarted();
        }

        console.log('[Swing] SwingActive started');
    }

    updateActive(frame, now, relativePYR, a_mag) {
        this.peakAMag = Math.max(this.peakAMag, a_mag);

        const point = {
            pitch: relativePYR.pitch,
            yaw: relativePYR.yaw,
            roll: relativePYR.roll,
            rawPitch: frame.pitch_deg,
            rawYaw: frame.yaw_deg,
            rawRoll: frame.roll_deg,
            timestamp: now
        };

        this.trajectory.push(point);

        if (this.onTrajectoryUpdate) {
            this.onTrajectoryUpdate(this.trajectory);
        }

        const duration = now - this.startTime;

        const sharpTurn = this.findRecentSharpTurn(now);
        if (sharpTurn) {
            this.splitSwing(now, point, a_mag, sharpTurn);
            return;
        }

        if (a_mag <= this.A_END && duration >= this.T_MIN) {
            this.finishSwing(now);
        }
    }

    findRecentSharpTurn(now) {
        if (this.trajectory.length < 3) return false;
        if (now - this.startTime < Math.max(this.T_MIN, this.MIN_SPLIT_INTERVAL)) return false;

        for (let pivotIndex = this.trajectory.length - 2; pivotIndex >= 1; pivotIndex--) {
            const turnAngle = this.calculateTurnAngleAt(pivotIndex);
            if (turnAngle !== null && turnAngle >= this.SHARP_TURN_ANGLE_DEG) {
                return { pivotIndex, turnAngle };
            }
        }

        return false;
    }

    calculateTurnAngleAt(pivotIndex) {
        const pivot = this.trajectory[pivotIndex];
        const before = this.findVectorBeforePivot(pivotIndex);
        const after = this.findVectorAfterPivot(pivotIndex);

        if (!before || !after) return null;

        const v1 = this.createAngleVector(before, pivot);
        const v2 = this.createAngleVector(pivot, after);

        const len1 = Math.hypot(v1.x, v1.y);
        const len2 = Math.hypot(v2.x, v2.y);
        if (len1 < this.TURN_VECTOR_MIN_DEG || len2 < this.TURN_VECTOR_MIN_DEG) {
            return null;
        }

        const dot = v1.x * v2.x + v1.y * v2.y;
        const cos = Math.max(-1, Math.min(1, dot / (len1 * len2)));
        return Math.acos(cos) * 180 / Math.PI;
    }

    findVectorBeforePivot(pivotIndex) {
        const pivot = this.trajectory[pivotIndex];

        for (let i = pivotIndex - 1; i >= 0; i--) {
            const vector = this.createAngleVector(this.trajectory[i], pivot);
            if (Math.hypot(vector.x, vector.y) >= this.TURN_VECTOR_MIN_DEG) {
                return this.trajectory[i];
            }
        }

        return null;
    }

    findVectorAfterPivot(pivotIndex) {
        const pivot = this.trajectory[pivotIndex];

        for (let i = pivotIndex + 1; i < this.trajectory.length; i++) {
            const vector = this.createAngleVector(pivot, this.trajectory[i]);
            if (Math.hypot(vector.x, vector.y) >= this.TURN_VECTOR_MIN_DEG) {
                return this.trajectory[i];
            }
        }

        return null;
    }

    calculateRecentTurnAngle() {
        const sharpTurn = this.findRecentSharpTurn(this.startTime + Math.max(this.T_MIN, this.MIN_SPLIT_INTERVAL));
        if (!sharpTurn) {
            return null;
        }
        return sharpTurn.turnAngle;
    }

    createAngleVector(from, to) {
        return {
            x: this.unwrapAngle(to.yaw - from.yaw),
            y: this.unwrapAngle(to.pitch - from.pitch)
        };
    }

    splitSwing(now, currentPoint, currentAMag, sharpTurn) {
        if (this.onSharpTurnSwingDetected) {
            const shouldContinue = this.onSharpTurnSwingDetected({ timestamp: now });
            if (shouldContinue === false) return;
        }

        const pivotIndex = sharpTurn?.pivotIndex ?? this.trajectory.length - 1;
        const previousTrajectory = this.trajectory;
        const emittedTrajectory = previousTrajectory.slice(0, pivotIndex + 1);
        const nextTrajectory = previousTrajectory.slice(pivotIndex);

        this.trajectory = emittedTrajectory;
        const emitted = this.emitSwing(now);
        if (!emitted) {
            this.trajectory = previousTrajectory;
            return;
        }

        this.startTime = now;
        this.trajectory = nextTrajectory.length >= 2
            ? nextTrajectory.map(p => ({ ...p }))
            : [{ ...currentPoint }];
        this.peakAMag = currentAMag;

        if (this.onSwingStarted) {
            this.onSwingStarted();
        }

        if (this.onTrajectoryUpdate) {
            this.onTrajectoryUpdate(this.trajectory);
        }

        console.log(`[Swing] Split at sharp turn: angle=${(sharpTurn?.turnAngle ?? 0).toFixed(1)}`);
    }

    finishSwing(now) {
        this.emitSwing(now);

        this.state = 'Cooldown';
        this.cooldownEndTime = now + this.T_COOLDOWN;
        this.trajectory = [];
        this.peakAMag = 0;
        console.log(`[Swing] Swing detected: intensity=${this.lastIntensity.toFixed(2)}`);
    }

    emitSwing(now) {
        if (!this.trajectory || this.trajectory.length < 2) {
            return false;
        }

        const intensity = this.calculateIntensity(this.peakAMag);
        this.lastIntensity = intensity;

        const lastPt = this.trajectory[this.trajectory.length - 1];
        const attackDir = this.pyrToDirection(lastPt.pitch, lastPt.yaw);

        if (this.onSwingDetected) {
            this.onSwingDetected({
                intensity,
                direction: attackDir,
                trajectory: [...this.trajectory],
                timestamp: now
            });
        }

        return true;
    }

    calculateIntensity(aMag) {
        return Math.max(0, Math.min(1, (aMag - this.A_START) / (this.A_MAX - this.A_START)));
    }

    pyrToDirection(pitch, yaw) {
        const pitchRad = pitch * Math.PI / 180;
        const yawRad = yaw * Math.PI / 180;
        const x = Math.cos(pitchRad) * Math.sin(yawRad);
        const y = Math.sin(pitchRad);
        const z = Math.cos(pitchRad) * Math.cos(yawRad);
        return { x, y, z };
    }

    unwrapAngle(angle) {
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
    }

    reset() {
        this.state = 'Idle';
        this.startTime = 0;
        this.cooldownEndTime = 0;
        this.lastIntensity = 0;
        this.trajectory = [];
        this.prevAMag = 0;
        this.peakAMag = 0;
        console.log('[SwingDetector] Reset executed');
    }
}
