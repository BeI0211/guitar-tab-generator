import { BasicPitch, noteFramesToTime, addPitchBendsToNoteEvents, outputToNotesPoly } from 'https://esm.sh/@spotify/basic-pitch';

/**
 * PitchDetector - AI-based polyphonic pitch detection using Basic Pitch
 */
class PitchDetector {
    constructor() {
        this.modelUrl = 'https://unpkg.com/@spotify/basic-pitch@1.0.1/model/model.json';
        this.basicPitch = null;
    }

    async init() {
        if (!this.basicPitch) {
            this.basicPitch = new BasicPitch(this.modelUrl);
        }
    }

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
     * Process full audio buffer and detect polyphonic notes
     */
    async processAudio(audioBuffer, sensitivity = 5, minNoteDuration = 0.08, progressCallback = null) {
        await this.init();

        const targetBuffer = await this.resampleAudio(audioBuffer);

        // frameThreshold = 0.3, onsetThreshold = 0.5 are standard for Basic Pitch
        const frameThreshold = Math.max(0.05, 0.5 - (sensitivity * 0.04)); 
        const onsetThreshold = Math.max(0.05, 0.7 - (sensitivity * 0.04)); 

        let framesOut = [];
        let onsetsOut = [];
        let contoursOut = [];
        
        await this.basicPitch.evaluateModel(
            targetBuffer,
            (frames, onsets, contours) => {
                framesOut.push(...frames);
                onsetsOut.push(...onsets);
                contoursOut.push(...contours);
            },
            (pct) => {
                if (progressCallback) progressCallback(pct);
            }
        );
        
        // Convert minimum note duration (seconds) to frames (~11.6ms per frame at 22050Hz with 256 hop size)
        const frameLengthSec = 256 / 22050; // ~0.0116s
        const minFrames = Math.max(3, Math.round(minNoteDuration / frameLengthSec));

        const rawNotes = noteFramesToTime(
            addPitchBendsToNoteEvents(
                contoursOut,
                outputToNotesPoly(framesOut, onsetsOut, frameThreshold, onsetThreshold, minFrames)
            )
        );
        
        return rawNotes.map(n => {
            const start = n.startTimeSeconds;
            const duration = n.durationSeconds;
            
            return {
                midi: Math.round(n.pitchMidi),
                startTime: start,
                endTime: start + duration,
                probability: n.amplitude,
                name: NoteUtils.midiToNoteName(Math.round(n.pitchMidi))
            };
        }).filter(n => n.endTime > n.startTime);
    }
}

/**
 * Musical note utilities
 */
class NoteUtils {
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

// Export for use globally to keep browser non-module compatibility
window.PitchDetector = PitchDetector;
window.NoteUtils = NoteUtils;
