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
        this.CIRCLE_MIN_AXIS_BALANCE = 0.30;
        this.CIRCLE_MIN_AREA = 80;
        this.CIRCLE_MIN_ANGLE_COVERAGE = 240;
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
        const { closure, pitchRange, yawRange, axisBalance, area, angleCoverage } = metrics;

        if (
            closure <= this.CIRCLE_MAX_CLOSURE &&
            pitchRange >= this.CIRCLE_MIN_AXIS_RANGE &&
            yawRange >= this.CIRCLE_MIN_AXIS_RANGE &&
            axisBalance >= this.CIRCLE_MIN_AXIS_BALANCE &&
            area >= this.CIRCLE_MIN_AREA &&
            angleCoverage >= this.CIRCLE_MIN_ANGLE_COVERAGE
        ) {
            console.log(`[Circle] Detected: C=${closure.toFixed(1)}, P=${pitchRange.toFixed(1)}, Y=${yawRange.toFixed(1)}, B=${axisBalance.toFixed(2)}, A=${area.toFixed(1)}, G=${angleCoverage.toFixed(0)}`);
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
                axisBalance: 0,
                area: 0,
                angleCoverage: 0
            };
        }

        return {
            closure: this.calculateClosureDistance(points),
            pitchRange: this.calculatePitchRange(points),
            yawRange: this.calculateYawRange(points),
            axisBalance: this.calculateAxisBalance(points),
            area: this.calculateArea(points),
            angleCoverage: this.calculateAngleCoverage(points)
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

    calculateAxisBalance(points) {
        const pitchRange = this.calculatePitchRange(points);
        const yawRange = this.calculateYawRange(points);
        const major = Math.max(pitchRange, yawRange);
        const minor = Math.min(pitchRange, yawRange);
        return major > 0 ? minor / major : 0;
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

    calculateAngleCoverage(points) {
        if (points.length < 3) return 0;

        const center = this.calculateCentroid(points);
        const maxRadius = points.reduce((max, p) => {
            return Math.max(max, Math.hypot(p.yaw - center.yaw, p.pitch - center.pitch));
        }, 0);

        if (maxRadius <= 0) return 0;

        const minRadius = Math.max(2, maxRadius * 0.25);
        const angles = points
            .map(p => ({
                radius: Math.hypot(p.yaw - center.yaw, p.pitch - center.pitch),
                angle: Math.atan2(p.pitch - center.pitch, p.yaw - center.yaw) * 180 / Math.PI
            }))
            .filter(p => p.radius >= minRadius)
            .map(p => (p.angle + 360) % 360)
            .sort((a, b) => a - b);

        if (angles.length < 3) return 0;

        let maxGap = 0;
        for (let i = 0; i < angles.length; i++) {
            const current = angles[i];
            const next = angles[(i + 1) % angles.length] + (i === angles.length - 1 ? 360 : 0);
            maxGap = Math.max(maxGap, next - current);
        }

        return 360 - maxGap;
    }

    calculateCentroid(points) {
        const sum = points.reduce((acc, p) => {
            acc.pitch += p.pitch;
            acc.yaw += p.yaw;
            return acc;
        }, { pitch: 0, yaw: 0 });

        return {
            pitch: sum.pitch / points.length,
            yaw: sum.yaw / points.length
        };
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

    clearBuffer() {
        this.buffer = [];
    }

    reset() {
        this.buffer = [];
        this.lastDetectedTime = 0;
        console.log('[CircleGestureRecognizer] Reset executed');
    }
}
