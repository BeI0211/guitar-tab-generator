/**
 * GuitarSynth - Realistic Guitar Playback using Soundfont-player
 */
export class GuitarSynth {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.instrument = null;
        this.isReady = false;
        this.instrumentName = 'acoustic_guitar_steel'; // or acoustic_guitar_nylon
    }

    async init(progressCallback = null) {
        if (this.isReady) return;
        
        try {
            if (progressCallback) progressCallback("기타 사운드 폰트 다운로드 중...");
            
            // Resume AudioContext just in case browser suspended it
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Load SoundFont via CDN (ensure Soundfont global is available from index.html)
            this.instrument = await Soundfont.instrument(this.audioContext, this.instrumentName, {
                soundfont: 'MusyngKite', 
                format: 'mp3'
            });

            this.isReady = true;
            if (progressCallback) progressCallback("준비 완료");
        } catch (err) {
            console.error("Synthesizer initialization error:", err);
            throw new Error("기타 사운드 시스템을 불러오는 데 실패했습니다.");
        }
    }

    /**
     * Play a specific MIDI note
     * @param {number} midi MIDI note number
     * @param {number} time Time in AudioContext seconds to start playing
     * @param {number} duration Duration in seconds
     * @returns AudioNode for stopping manually if needed
     */
    playNote(midi, time, duration = 1.5) {
        if (!this.isReady || !this.instrument) return null;
        
        // Options: specify duration to let it ring naturally or stop
        return this.instrument.play(midi, time, { duration: duration, gain: 2.0 });
    }

    /**
     * Stop all currently playing notes (Panic button)
     */
    stopAll() {
        if (this.instrument) {
            this.instrument.stop();
        }
    }

    getCurrentTime() {
        return this.audioContext.currentTime;
    }
}
