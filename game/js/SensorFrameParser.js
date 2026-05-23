/**
 * SensorFrameParser.js
 * Parses controller sensor frames and tracks receive/drop statistics.
 *
 * Supported frames:
 * - Legacy Euler frame, 15 bytes:
 *   S, seq, ax, ay, az, pitch, yaw, roll, flags
 * - Quaternion game frame, 17 bytes:
 *   S, seq, ax, ay, az, qw, qx, qy, qz, flags
 */

export class SensorFrameParser {
    constructor() {
        this.lastSeq = null;
        this.totalFrames = 0;
        this.droppedFrames = 0;
        this.lastQuaternion = null;

        this.frameTimestamps = [];
        this.MAX_TIMESTAMP_HISTORY = 60;
    }

    /**
     * @param {Uint8Array} data
     * @returns {Object|null}
     */
    parseFrame(data) {
        if (data.length !== 15 && data.length !== 17) {
            console.warn('[Parser] Unexpected frame size:', data.length);
            return null;
        }

        if (data[0] !== 0x53) {
            console.warn('[Parser] Invalid frame header:', data[0].toString(16));
            return null;
        }

        const seq = data[1];
        this.updateSequenceStats(seq);

        const ax_g = this.readInt16LE(data, 2) / 100.0;
        const ay_g = this.readInt16LE(data, 4) / 100.0;
        const az_g = this.readInt16LE(data, 6) / 100.0;
        const a_mag = Math.sqrt(ax_g * ax_g + ay_g * ay_g + az_g * az_g);

        let pitch_deg;
        let yaw_deg;
        let roll_deg;
        let quat_w = null;
        let quat_x = null;
        let quat_y = null;
        let quat_z = null;
        let frameFormat = 'euler15';
        let flags = 0;

        if (data.length === 17) {
            const quat = this.parseQuaternionFrame(data);
            quat_w = quat.w;
            quat_x = quat.x;
            quat_y = quat.y;
            quat_z = quat.z;

            const pyr = this.quaternionToControllerPYR(quat);
            pitch_deg = pyr.pitch;
            yaw_deg = pyr.yaw;
            roll_deg = pyr.roll;
            flags = data[16];
            frameFormat = 'quat17';
        } else {
            const pitch_raw = this.readInt16LE(data, 8);
            const yaw_raw = this.readInt16LE(data, 10);
            const roll_raw = this.readInt16LE(data, 12);

            pitch_deg = -(pitch_raw / 10.0);
            yaw_deg = yaw_raw / 10.0;
            roll_deg = roll_raw / 10.0;
            flags = data[14];
        }

        const now = performance.now();
        this.frameTimestamps.push(now);
        if (this.frameTimestamps.length > this.MAX_TIMESTAMP_HISTORY) {
            this.frameTimestamps.shift();
        }

        return {
            seq,
            ax_g,
            ay_g,
            az_g,
            a_mag,
            pitch_deg,
            yaw_deg,
            roll_deg,
            quat_w,
            quat_x,
            quat_y,
            quat_z,
            frameFormat,
            flags,
            timestamp: now
        };
    }

    updateSequenceStats(seq) {
        if (this.lastSeq !== null) {
            const expectedSeq = (this.lastSeq + 1) % 256;
            if (seq !== expectedSeq) {
                const dropped = (seq - expectedSeq + 256) % 256;
                this.droppedFrames += dropped;
                console.log(`[Parser] Frame drop detected: expected=${expectedSeq}, actual=${seq}, dropped=${dropped}`);
            }
        }

        this.lastSeq = seq;
        this.totalFrames++;
    }

    parseQuaternionFrame(data) {
        let w = this.readInt16LE(data, 8) / 10000.0;
        let x = this.readInt16LE(data, 10) / 10000.0;
        let y = this.readInt16LE(data, 12) / 10000.0;
        let z = this.readInt16LE(data, 14) / 10000.0;

        const len = Math.sqrt(w * w + x * x + y * y + z * z);
        if (len > 0.000001) {
            w /= len;
            x /= len;
            y /= len;
            z /= len;
        } else {
            w = 1;
            x = 0;
            y = 0;
            z = 0;
        }

        if (this.lastQuaternion) {
            const dot = w * this.lastQuaternion.w + x * this.lastQuaternion.x + y * this.lastQuaternion.y + z * this.lastQuaternion.z;
            if (dot < 0) {
                w = -w;
                x = -x;
                y = -y;
                z = -z;
            }
        }

        this.lastQuaternion = { w, x, y, z };
        return this.lastQuaternion;
    }

    quaternionToControllerPYR(q) {
        const { w, x, y, z } = q;

        const yaw = this.normalize180(
            Math.atan2(
                2.0 * (x * y + z * w),
                1.0 - 2.0 * (y * y + z * z)
            ) * 180.0 / Math.PI
        );

        const r21 = 2.0 * (y * z + x * w);
        const r22 = 1.0 - 2.0 * (x * x + y * y);
        const r20 = 2.0 * (x * z - y * w);

        let pitch = -this.normalize180(Math.atan2(r21, r22) * 180.0 / Math.PI);
        let roll = -this.normalize180(
            Math.atan2(-r20, Math.sqrt(r21 * r21 + r22 * r22)) * 180.0 / Math.PI
        );

        if (Math.abs(roll) >= 90) {
            pitch -= 180;
        }

        return {
            pitch: this.normalize180(pitch),
            yaw,
            roll: this.normalize180(roll)
        };
    }

    normalize180(angle) {
        while (angle > 180) angle -= 360;
        while (angle <= -180) angle += 360;
        return angle;
    }

    readInt16LE(data, offset) {
        const low = data[offset];
        const high = data[offset + 1];
        const value = (high << 8) | low;
        return value > 32767 ? value - 65536 : value;
    }

    getReceiveHz() {
        if (this.frameTimestamps.length < 2) {
            return 0;
        }

        const duration = this.frameTimestamps[this.frameTimestamps.length - 1] - this.frameTimestamps[0];
        const frameCount = this.frameTimestamps.length - 1;

        if (duration === 0) {
            return 0;
        }

        return (frameCount / duration) * 1000;
    }

    getDropRate() {
        if (this.totalFrames === 0) {
            return 0;
        }
        return (this.droppedFrames / (this.totalFrames + this.droppedFrames)) * 100;
    }

    getStats() {
        return {
            totalFrames: this.totalFrames,
            droppedFrames: this.droppedFrames,
            dropRate: this.getDropRate(),
            receiveHz: this.getReceiveHz()
        };
    }

    resetStats() {
        this.lastSeq = null;
        this.totalFrames = 0;
        this.droppedFrames = 0;
        this.lastQuaternion = null;
        this.frameTimestamps = [];
    }
}
