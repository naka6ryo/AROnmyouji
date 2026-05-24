/**
 * CircleGestureRecognizer.js
 * Detects circle gestures from raw pitch/yaw history.
 */

export class CircleGestureRecognizer {
    constructor() {
        this.buffer = [];
        this.GESTURE_WINDOW = 1500;
        this.GESTURE_MIN_DURATION = 600;
        this.CIRCLE_MAX_CLOSURE = 25;
        this.CIRCLE_MIN_AXIS_RANGE = 7;
        this.CIRCLE_MIN_AREA = 80;
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

        this.buffer = this.buffer.filter(p => now - p.timestamp <= this.GESTURE_WINDOW);

        if (this.buffer.length < 2) return;
        const duration = now - this.buffer[0].timestamp;
        if (duration < this.GESTURE_MIN_DURATION) return;
        if (now - this.lastDetectedTime < this.CIRCLE_COOLDOWN) return;

        const metrics = this.calculateMetrics();
        const { closure, pitchRange, yawRange, area } = metrics;

        if (
            closure <= this.CIRCLE_MAX_CLOSURE &&
            pitchRange >= this.CIRCLE_MIN_AXIS_RANGE &&
            yawRange >= this.CIRCLE_MIN_AXIS_RANGE &&
            area >= this.CIRCLE_MIN_AREA
        ) {
            console.log(`[Circle] Detected: C=${closure.toFixed(1)}, P=${pitchRange.toFixed(1)}, Y=${yawRange.toFixed(1)}, A=${area.toFixed(1)}`);
            this.lastDetectedTime = now;
            this.buffer = [];

            if (this.onCircleDetected) {
                this.onCircleDetected({ timestamp: now, ...metrics });
            }
        }
    }

    calculateMetrics() {
        const points = this.getUnwrappedPoints();
        if (points.length < 2) {
            return {
                closure: Infinity,
                pitchRange: 0,
                yawRange: 0,
                area: 0
            };
        }

        return {
            closure: this.calculateClosureDistance(points),
            pitchRange: this.calculatePitchRange(points),
            yawRange: this.calculateYawRange(points),
            area: this.calculateArea(points)
        };
    }

    getUnwrappedPoints() {
        if (this.buffer.length === 0) return [];

        const points = [{
            pitch: this.buffer[0].pitch,
            yaw: this.buffer[0].yaw,
            timestamp: this.buffer[0].timestamp
        }];

        for (let i = 1; i < this.buffer.length; i++) {
            const prev = points[i - 1];
            const current = this.buffer[i];
            const rawPrev = this.buffer[i - 1];
            points.push({
                pitch: current.pitch,
                yaw: prev.yaw + this.unwrapAngle(current.yaw - rawPrev.yaw),
                timestamp: current.timestamp
            });
        }

        return points;
    }

    calculateClosureDistance(points) {
        if (points.length < 2) return Infinity;
        const start = points[0];
        const end = points[points.length - 1];
        const dPitch = end.pitch - start.pitch;
        const dYaw = end.yaw - start.yaw;
        return Math.sqrt(dPitch * dPitch + dYaw * dYaw);
    }

    calculatePitchRange(points) {
        const pitches = points.map(p => p.pitch);
        return Math.max(...pitches) - Math.min(...pitches);
    }

    calculateYawRange(points) {
        const yaws = points.map(p => p.yaw);
        return Math.max(...yaws) - Math.min(...yaws);
    }

    calculateArea(points) {
        if (points.length < 3) return 0;

        let sum = 0;
        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];
            sum += p1.yaw * p2.pitch - p2.yaw * p1.pitch;
        }

        return Math.abs(sum) / 2;
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
            ...this.calculateMetrics(),
            bufferSize: this.buffer.length
        };
    }

    reset() {
        this.buffer = [];
        this.lastDetectedTime = 0;
        console.log('[CircleGestureRecognizer] Reset executed');
    }
}
