export class DebugOverlay {
    constructor() {
        this.overlayElement = document.getElementById('debugOverlay');
        this.debugElements = {
            bleState: document.getElementById('debugBleState'),
            hz: document.getElementById('debugHz'),
            rawHz: document.getElementById('debugRawHz'),
            processedHz: document.getElementById('debugProcessedHz'),
            skippedSensor: document.getElementById('debugSkippedSensor'),
            drops: document.getElementById('debugDrops'),
            dropRate: document.getElementById('debugDropRate'),
            amag: document.getElementById('debugAmag'),
            pitch: document.getElementById('debugPitch'),
            yaw: document.getElementById('debugYaw'),
            roll: document.getElementById('debugRoll'),
            swingState: document.getElementById('debugSwingState'),
            cooldown: document.getElementById('debugCooldown'),
            circle: document.getElementById('debugCircle'),
            haptics: document.getElementById('debugHaptics'),
            error: document.getElementById('debugError')
        };
        this.isVisible = false;
        this._pendingData = {};
        this.hapticsSentCount = 0;
        this.lastHapticEvent = '--';
    }

    toggle() {
        this.isVisible = !this.isVisible;
        if (!this.overlayElement) return;

        if (this.isVisible) {
            this.overlayElement.classList.remove('hidden');
            const pending = this._pendingData;
            this._pendingData = {};
            this.update(pending);
        } else {
            this.overlayElement.classList.add('hidden');
        }
    }

    update(data = {}) {
        if (!this.isVisible) {
            const pendingData = { ...data };
            if (data.hapticEvent !== undefined) {
                this.lastHapticEvent = data.hapticEvent;
                this.hapticsSentCount++;
                delete pendingData.hapticEvent;
            }
            Object.assign(this._pendingData, pendingData);
            return;
        }

        this.setText('bleState', data.bleConnected === undefined ? undefined : (data.bleConnected ? 'connected' : 'disconnected'));
        this.setText('hz', data.receiveHz === undefined ? undefined : data.receiveHz.toFixed(1));
        this.setText('rawHz', data.rawReceiveHz === undefined ? undefined : data.rawReceiveHz.toFixed(1));
        this.setText('processedHz', data.processedHz === undefined ? undefined : data.processedHz.toFixed(1));
        this.setText('skippedSensor', data.skippedSensorFrames);
        this.setText('drops', data.droppedFrames);
        this.setText('dropRate', data.dropRate === undefined ? undefined : data.dropRate.toFixed(2));
        this.setText('amag', data.a_mag === undefined ? undefined : data.a_mag.toFixed(3));
        this.setText('pitch', data.pitch === undefined ? undefined : data.pitch.toFixed(1));
        this.setText('yaw', data.yaw === undefined ? undefined : data.yaw.toFixed(1));
        this.setText('roll', data.roll === undefined ? undefined : data.roll.toFixed(1));
        this.setText('swingState', data.swingState);
        this.setText('cooldown', data.cooldownRemaining === undefined ? undefined : Math.round(data.cooldownRemaining));

        if (data.circleDebug !== undefined) {
            const circle = data.circleDebug;
            this.setText('circle', circle.valid
                ? `C=${circle.closure.toFixed(0)}, P=${circle.pitchRange.toFixed(0)}, Y=${circle.yawRange.toFixed(0)}, B=${circle.axisBalance.toFixed(2)}, A=${circle.area.toFixed(0)}, G=${circle.angleCoverage.toFixed(0)}`
                : 'none');
        }

        if (data.hapticEvent !== undefined) {
            this.lastHapticEvent = data.hapticEvent;
            this.hapticsSentCount++;
        }
        const hapticStats = data.hapticSentCount === undefined
            ? `${this.lastHapticEvent} (${this.hapticsSentCount})`
            : `${this.lastHapticEvent} (${data.hapticSentCount}/${data.hapticSkippedCount || 0})`;
        this.setText('haptics', hapticStats);
        this.setText('error', data.error);
    }

    setText(key, value) {
        if (value === undefined) return;
        const element = this.debugElements[key];
        if (element) element.textContent = String(value);
    }

    log() {}
    logInfo() {}
    logWarn() {}
    logError(message) {
        this.update({ error: message });
    }
    clearLogs() {}
}
