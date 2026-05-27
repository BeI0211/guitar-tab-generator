import { BasicPitch, noteFramesToTime, addPitchBendsToNoteEvents, outputToNotesPoly } from 'https://esm.sh/@spotify/basic-pitch';
import * as tf from 'https://esm.sh/@tensorflow/tfjs';

let basicPitch = null;

self.onmessage = async function(e) {
    if (e.data.type === 'PROCESS') {
        try {
            console.log("WORKER START, TF 백엔드:", tf.getBackend());
            const { channelData, sampleRate, sensitivity, minNoteDurationSec } = e.data.payload;
            
            if (!basicPitch) {
                self.postMessage({ type: 'PROGRESS', pct: 0, text: 'AI 모델 로드 중...' });
                
                // Force a specific backend if possible, usually webgl or wasm
                await tf.ready();
                console.log("TF READY, 현재 백엔드:", tf.getBackend());

                basicPitch = new BasicPitch('https://unpkg.com/@spotify/basic-pitch@1.0.1/model/model.json');
            }

            // Create a mock AudioBuffer interface that Basic Pitch expects
            const mockBuffer = {
                length: channelData.length,
                sampleRate: sampleRate,
                numberOfChannels: 1,
                getChannelData: (channel) => channelData
            };
            
            const frameThreshold = Math.max(0.05, 0.5 - (sensitivity * 0.04)); 
            const onsetThreshold = Math.max(0.05, 0.7 - (sensitivity * 0.04)); 

            let framesOut = [];
            let onsetsOut = [];
            let contoursOut = [];

            await basicPitch.evaluateModel(
                mockBuffer,
                (frames, onsets, contours) => {
                    framesOut.push(...frames);
                    onsetsOut.push(...onsets);
                    contoursOut.push(...contours);
                },
                (pct) => {
                    self.postMessage({ type: 'PROGRESS', pct: pct, text: `AI 피치 분석 중... (${Math.round(pct * 100)}%)` });
                }
            );

            const frameLengthSec = 256 / 22050; 
            const minFrames = Math.max(3, Math.round(minNoteDurationSec / frameLengthSec));

            const rawNotes = noteFramesToTime(
                addPitchBendsToNoteEvents(
                    contoursOut,
                    outputToNotesPoly(framesOut, onsetsOut, frameThreshold, onsetThreshold, minFrames)
                )
            );

            const processedNotes = rawNotes.map(n => {
                return {
                    midi: Math.round(n.pitchMidi),
                    startTime: n.startTimeSeconds,
                    endTime: n.startTimeSeconds + n.durationSeconds,
                    probability: n.amplitude,
                };
            }).filter(n => n.endTime > n.startTime);

            self.postMessage({ type: 'DONE', notes: processedNotes });

        } catch (error) {
            self.postMessage({ type: 'ERROR', error: error.message || String(error) });
        }
    }
};
