/**
 * DebugOverlay.js
 * HUD、ログ機構、受信Hz、欠落率表示を行うクラス
 */

export class DebugOverlay {
    constructor() {
        // DOM要素取得
        this.overlayElement = document.getElementById('debugOverlay');
        this.logContentElement = document.getElementById('logContent');
        
        // 要素が存在することを確認
        if (!this.overlayElement) {
            console.error('[DebugOverlay] debugOverlay要素が見つかりません');
        }
        if (!this.logContentElement) {
            console.error('[DebugOverlay] logContent要素が見つかりません');
        }
        
        // デバッグ表示項目
        this.debugElements = {
            bleState: document.getElementById('debugBleState'),
            hz: document.getElementById('debugHz'),
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
        
        // ログリングバッファ
        this.logs = [];
        this.MAX_LOGS = 100;
        
        // 表示状態
        this.isVisible = false;
        
        // 触覚送信カウント
        this.hapticsSentCount = 0;
        this.lastHapticEvent = '--';
        
        console.log('[DebugOverlay] 初期化完了, visible=' + this.isVisible);
    }
    
    /**
     * 表示切替
     */
    toggle() {
        this.isVisible = !this.isVisible;
        console.log('[DebugOverlay] toggle() 呼ばれた: isVisible=' + this.isVisible);
        
        if (!this.overlayElement) {
            console.error('[DebugOverlay] toggle失敗: overlayElement が null');
            return;
        }
        
        if (this.isVisible) {
            this.overlayElement.classList.remove('hidden');
            console.log('[DebugOverlay] 表示: hidden クラスを削除');
        } else {
            this.overlayElement.classList.add('hidden');
            console.log('[DebugOverlay] 非表示: hidden クラスを追加');
        }
    }
    
    /**
     * デバッグ情報を更新
     */
    update(data) {
        // BLE状態
        if (data.bleConnected !== undefined) {
            this.debugElements.bleState.textContent = data.bleConnected ? '接続中' : '未接続';
        }
        
        // 受信Hz
        if (data.receiveHz !== undefined) {
            this.debugElements.hz.textContent = data.receiveHz.toFixed(1);
        }
        
        // 欠落数と欠落率
        if (data.droppedFrames !== undefined) {
            this.debugElements.drops.textContent = data.droppedFrames;
        }
        if (data.dropRate !== undefined) {
            this.debugElements.dropRate.textContent = data.dropRate.toFixed(2);
        }
        
        // 加速度大きさ
        if (data.a_mag !== undefined) {
            this.debugElements.amag.textContent = data.a_mag.toFixed(3);
        }
        
        // 姿勢角
        if (data.pitch !== undefined) {
            this.debugElements.pitch.textContent = data.pitch.toFixed(1);
        }
        if (data.yaw !== undefined) {
            this.debugElements.yaw.textContent = data.yaw.toFixed(1);
        }
        if (data.roll !== undefined) {
            this.debugElements.roll.textContent = data.roll.toFixed(1);
        }
        
        // 斬撃状態
        if (data.swingState !== undefined) {
            this.debugElements.swingState.textContent = data.swingState;
        }
        if (data.cooldownRemaining !== undefined) {
            this.debugElements.cooldown.textContent = Math.round(data.cooldownRemaining);
        }
        
        // 円判定
        if (data.circleDebug !== undefined) {
            const circle = data.circleDebug;
            if (circle.valid) {
                this.debugElements.circle.textContent = 
                    `L=${circle.length.toFixed(0)}, C=${circle.closure.toFixed(0)}, R=${circle.rotation.toFixed(0)}`;
            } else {
                this.debugElements.circle.textContent = '未検出';
            }
        }
        
        // 触覚送信
        if (data.hapticEvent !== undefined) {
            this.lastHapticEvent = data.hapticEvent;
            this.hapticsSentCount++;
        }
        this.debugElements.haptics.textContent = `${this.lastHapticEvent} (${this.hapticsSentCount}回)`;
        
        // エラー
        if (data.error !== undefined) {
            this.debugElements.error.textContent = data.error || '--';
        }
    }
    
    /**
     * ログを追加
     */
    log(message, level = 'info') {
        const timestamp = new Date().toLocaleTimeString('ja-JP', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
        
        const logEntry = {
            timestamp,
            level,
            message
        };
        
        this.logs.push(logEntry);
        
        // リングバッファ
        if (this.logs.length > this.MAX_LOGS) {
            this.logs.shift();
        }
        
        // DOM更新
        this.updateLogDisplay();
        
        // コンソールにも出力
        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
    
    /**
     * ログ表示を更新
     */
    updateLogDisplay() {
        if (!this.logContentElement) {
            console.error('[DebugOverlay] updateLogDisplay失敗: logContentElement が null');
            return;
        }
        
        // 最新10件のみ表示
        const recentLogs = this.logs.slice(-10);
        
        this.logContentElement.innerHTML = recentLogs
            .map(log => {
                let color = '#0f0';
                if (log.level === 'warn') color = '#ff0';
                if (log.level === 'error') color = '#f00';
                
                return `<p style="color: ${color};">[${log.timestamp}] ${log.message}</p>`;
            })
            .join('');
        
        // 自動スクロール
        this.logContentElement.scrollTop = this.logContentElement.scrollHeight;
    }
    
    /**
     * エラーをログ
     */
    logError(message) {
        this.log(message, 'error');
        this.update({ error: message });
    }
    
    /**
     * 警告をログ
     */
    logWarn(message) {
        this.log(message, 'warn');
    }
    
    /**
     * 情報をログ
     */
    logInfo(message) {
        this.log(message, 'info');
    }
    
    /**
     * ログをクリア
     */
    clearLogs() {
        this.logs = [];
        this.updateLogDisplay();
    }
}
