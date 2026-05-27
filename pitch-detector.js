/**
 * PitchDetector - AI-based polyphonic pitch detection proxy via Web Worker
 */
export class PitchDetector {
    /**
     * Resample audio buffer to 22050Hz and mixdown to Mono for Basic Pitch
     */
    async resampleAudio(audioBuffer) {
        if (audioBuffer.sampleRate === 22050 && audioBuffer.numberOfChannels === 1) {
            return audioBuffer;
        }
        
        // Force 1 channel (mono) and 22050Hz
        const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
            1, 
            audioBuffer.duration * 22050, 
            22050
        );
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start(0);
        return await ctx.startRendering();
    }

    /**
     * Process full audio buffer using a background Web Worker
     */
    processAudio(audioBuffer, sensitivity = 5, minNoteDuration = 0.08, progressCallback = null) {
        return new Promise(async (resolve, reject) => {
            try {
                if (progressCallback) progressCallback(0.01, "오디오 변환 중(22050Hz)...");
                const targetBuffer = await this.resampleAudio(audioBuffer);
                const channelData = targetBuffer.getChannelData(0);

                const worker = new Worker('pitch-worker.js', { type: 'module' });
                
                worker.onmessage = (e) => {
                    const msg = e.data;
                    if (msg.type === 'PROGRESS') {
                        if (progressCallback) progressCallback(msg.pct, msg.text);
                    } else if (msg.type === 'DONE') {
                        worker.terminate();
                        // Add NoteName calculation since worker just gives MIDI number
                        const finalNotes = msg.notes.map(n => ({
                            ...n,
                            name: NoteUtils.midiToNoteName(Math.round(n.midi))
                        }));
                        resolve(finalNotes);
                    } else if (msg.type === 'ERROR') {
                        worker.terminate();
                        reject(new Error(msg.error));
                    }
                };
                
                worker.onerror = (e) => {
                    worker.terminate();
                    reject(new Error("Worker Error: " + e.message));
                };

                worker.postMessage({
                    type: 'PROCESS',
                    payload: {
                        channelData: channelData,
                        sampleRate: 22050,
                        sensitivity: sensitivity,
                        minNoteDurationSec: minNoteDuration
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    }
}

/**
 * Musical note utilities
 */
export class NoteUtils {
    static NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    static frequencyToMidi(frequency) {
        return 69 + 12 * Math.log2(frequency / 440);
    }

    static midiToFrequency(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    static midiToNoteName(midi) {
        const noteIndex = Math.round(midi) % 12;
        const octave = Math.floor(Math.round(midi) / 12) - 1;
        return `${this.NOTE_NAMES[noteIndex]}${octave}`;
    }

    static midiToNoteClass(midi) {
        const noteIndex = Math.round(midi) % 12;
        return this.NOTE_NAMES[noteIndex];
    }

    static frequencyToNoteName(frequency) {
        const midi = this.frequencyToMidi(frequency);
        return this.midiToNoteName(midi);
    }

    static snapToNote(frequency) {
        const midi = Math.round(this.frequencyToMidi(frequency));
        return {
            midi: midi,
            frequency: this.midiToFrequency(midi),
            name: this.midiToNoteName(midi)
        };
    }
}
