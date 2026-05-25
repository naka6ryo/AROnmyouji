/**
 * CircleGestureRecognizer.js
 * Detects circle gestures from raw pitch/yaw history.
 */

export class CircleGestureRecognizer {
    constructor() {
        this.buffer = [];
        this.GESTURE_WINDOW = 1500;
        this.GESTURE_MIN_DURATION = 600;
        this.A_START = 0.60;
        this.A_END = 0.60;
        this.DA_START = 0.10;
        this.CIRCLE_MAX_CLOSURE = 25;
        this.CIRCLE_MIN_AXIS_RANGE = 7;
        this.CIRCLE_MIN_AXIS_BALANCE = 0.30;
        this.CIRCLE_MIN_AREA = 80;
        this.CIRCLE_MIN_ANGLE_COVERAGE = 240;
        this.CIRCLE_CANDIDATE_MIN_AREA = 40;
        this.CIRCLE_CANDIDATE_MIN_ANGLE_COVERAGE = 120;
        this.CIRCLE_COOLDOWN = 700;

        this.state = 'Idle';
        this.startTime = 0;
        this.prevAMag = 0;
        this.peakAMag = 0;
        this.lastDetectedTime = -Infinity;

        this.onCircleDetected = null;
    }

    update(frame, now) {
        const aMag = frame.a_mag ?? 0;
        const daMag = aMag - this.prevAMag;

        switch (this.state) {
            case 'Idle':
                if (
                    aMag >= this.A_START &&
                    daMag >= this.DA_START &&
                    now - this.lastDetectedTime >= this.CIRCLE_COOLDOWN
                ) {
                    this.startGesture(frame, now, aMag);
                }
                break;

            case 'Recording':
                this.recordPoint(frame, now);
                this.peakAMag = Math.max(this.peakAMag, aMag);
                if (now - this.startTime > this.GESTURE_WINDOW) {
                    this.finishGesture(now);
                } else if (aMag <= this.A_END) {
                    this.finishGesture(now);
                }
                break;
        }

        this.prevAMag = aMag;
    }

    startGesture(frame, now, aMag) {
        this.state = 'Recording';
        this.startTime = now;
        this.peakAMag = aMag;
        this.buffer = [];
        this.recordPoint(frame, now);
    }

    recordPoint(frame, now) {
        this.buffer.push({
            pitch: frame.pitch_deg,
            yaw: frame.yaw_deg,
            timestamp: now
        });

        this.buffer = this.buffer.filter(p => now - p.timestamp <= this.GESTURE_WINDOW);
    }

    finishGesture(now) {
        if (this.buffer.length < 2) {
            this.clearBuffer();
            this.state = 'Idle';
            return;
        }

        if (now - this.lastDetectedTime < this.CIRCLE_COOLDOWN) {
            this.clearBuffer();
            return;
        }

        const metrics = this.calculateMetrics();

        this.emitIfCircle(metrics, now);

        this.clearBuffer();
        this.state = 'Idle';
        this.startTime = 0;
        this.peakAMag = 0;
    }

    calculateMetrics() {
        const points = this.getUnwrappedPoints();
        return this.calculateMetricsForPoints(points);
    }

    calculateMetricsForPoints(points) {
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

    tryDetectFromTrajectory(trajectory, now) {
        if (!trajectory || trajectory.length < 2) return false;
        if (now - this.lastDetectedTime < this.CIRCLE_COOLDOWN) return false;

        const rawPoints = trajectory.map(point => ({
            pitch: typeof point.rawPitch === 'number' ? point.rawPitch : point.pitch,
            yaw: typeof point.rawYaw === 'number' ? point.rawYaw : point.yaw,
            timestamp: point.timestamp
        }));
        const points = this.unwrapPoints(rawPoints);
        const metrics = this.calculateMetricsForPoints(points);
        return this.emitIfCircle(metrics, now);
    }

    emitIfCircle(metrics, now) {
        if (!this.isCircleMetrics(metrics)) return false;

        console.log(`[Circle] Detected: C=${metrics.closure.toFixed(1)}, P=${metrics.pitchRange.toFixed(1)}, Y=${metrics.yawRange.toFixed(1)}, B=${metrics.axisBalance.toFixed(2)}, A=${metrics.area.toFixed(1)}, G=${metrics.angleCoverage.toFixed(0)}`);
        this.lastDetectedTime = now;
        this.buffer = [];

        if (this.onCircleDetected) {
            this.onCircleDetected({ timestamp: now, ...metrics });
        }

        return true;
    }

    isCircleMetrics(metrics) {
        return (
            metrics.closure <= this.CIRCLE_MAX_CLOSURE &&
            metrics.pitchRange >= this.CIRCLE_MIN_AXIS_RANGE &&
            metrics.yawRange >= this.CIRCLE_MIN_AXIS_RANGE &&
            metrics.axisBalance >= this.CIRCLE_MIN_AXIS_BALANCE &&
            metrics.area >= this.CIRCLE_MIN_AREA &&
            metrics.angleCoverage >= this.CIRCLE_MIN_ANGLE_COVERAGE
        );
    }

    getUnwrappedPoints() {
        return this.unwrapPoints(this.buffer);
    }

    unwrapPoints(rawPoints) {
        if (rawPoints.length === 0) return [];

        const points = [{
            pitch: rawPoints[0].pitch,
            yaw: rawPoints[0].yaw,
            timestamp: rawPoints[0].timestamp
        }];

        for (let i = 1; i < rawPoints.length; i++) {
            const prev = points[i - 1];
            const current = rawPoints[i];
            const rawPrev = rawPoints[i - 1];
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

    isPotentialCircle() {
        if (this.state !== 'Recording' || this.buffer.length < 3) return false;

        const metrics = this.calculateMetrics();
        return (
            metrics.pitchRange >= this.CIRCLE_MIN_AXIS_RANGE &&
            metrics.yawRange >= this.CIRCLE_MIN_AXIS_RANGE &&
            metrics.axisBalance >= this.CIRCLE_MIN_AXIS_BALANCE &&
            metrics.area >= this.CIRCLE_CANDIDATE_MIN_AREA &&
            metrics.angleCoverage >= this.CIRCLE_CANDIDATE_MIN_ANGLE_COVERAGE
        );
    }

    clearBuffer() {
        this.buffer = [];
        this.state = 'Idle';
        this.startTime = 0;
        this.peakAMag = 0;
    }

    reset() {
        this.clearBuffer();
        this.prevAMag = 0;
        this.lastDetectedTime = -Infinity;
        console.log('[CircleGestureRecognizer] Reset executed');
    }
}
