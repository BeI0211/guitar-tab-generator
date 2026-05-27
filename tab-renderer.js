/**
 * TabRenderer - Canvas-based guitar tab renderer
 */
export class TabRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Layout constants
        this.padding = { top: 40, right: 40, bottom: 40, left: 60 };
        this.stringSpacing = 20;
        this.noteSpacing = 30;
        this.lineHeight = this.stringSpacing * 5 + 60; // 6 strings + gap
        this.notesPerLine = 32;
        
        // Colors
        this.colors = {
            bg: '#16162a',
            string: 'rgba(129, 140, 248, 0.3)',
            stringLabel: '#818cf8',
            fretNumber: '#e8e8f0',
            fretBg: 'rgba(129, 140, 248, 0.12)',
            barLine: 'rgba(129, 140, 248, 0.4)',
            highlight: '#c084fc',
            measureNumber: '#6868a0',
        };
    }

    /**
     * Render tab notes onto canvas
     */
    render(tabNotes, stringNames = ['E', 'A', 'D', 'G', 'B', 'e'], bpm = '-') {
        if (!tabNotes || tabNotes.length === 0) {
            this.renderEmptyState();
            return;
        }

        // Calculate time-based line layout
        let measureDuration = 2.0; // fallback 120 BPM
        if (bpm !== '-' && !isNaN(bpm) && bpm > 0) {
            measureDuration = (60 / bpm) * 4;
        }

        const measuresPerLine = 4;
        const lineDuration = measureDuration * measuresPerLine;
        
        let maxTime = 0;
        const noteRangesByLine = [];
        let currentLineNotes = [];
        let currentLineEnd = lineDuration;

        for (const note of tabNotes) {
            if (note.endTime > maxTime) maxTime = note.endTime;
            
            while (note.startTime >= currentLineEnd) {
                noteRangesByLine.push(currentLineNotes);
                currentLineNotes = [];
                currentLineEnd += lineDuration;
            }
            currentLineNotes.push(note);
        }
        noteRangesByLine.push(currentLineNotes);

        const totalLines = noteRangesByLine.length;
        const canvasWidth = 1060; // fixed width
        const canvasHeight = this.padding.top + totalLines * this.lineHeight + this.padding.bottom;

        // Set canvas size with device pixel ratio for crisp rendering
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = canvasWidth * dpr;
        this.canvas.height = canvasHeight * dpr;
        this.canvas.style.width = canvasWidth + 'px';
        this.canvas.style.height = canvasHeight + 'px';
        this.ctx.scale(dpr, dpr);

        // Clear
        this.ctx.fillStyle = this.colors.bg;
        this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Render each line
        for (let lineIdx = 0; lineIdx < totalLines; lineIdx++) {
            const y = this.padding.top + lineIdx * this.lineHeight;
            const lineNotes = noteRangesByLine[lineIdx];
            const lineStartTime = lineIdx * lineDuration;

            this.renderLine(y, lineNotes, lineIdx, stringNames, canvasWidth, lineStartTime, measureDuration, measuresPerLine);
        }
    }

    renderLine(y, notes, lineIndex, stringNames, canvasWidth, lineStartTime, measureDuration, measuresPerLine) {
        const startX = this.padding.left;
        const endX = canvasWidth - this.padding.right;
        const drawableWidth = endX - startX;
        const lineDuration = measureDuration * measuresPerLine;

        // Helper to convert time to X pos
        const timeToX = (time) => {
            const relativeTime = time - lineStartTime;
            return startX + (relativeTime / lineDuration) * drawableWidth;
        };

        // Draw strings
        this.ctx.lineWidth = 1;
        for (let s = 0; s < 6; s++) {
            const sy = y + s * this.stringSpacing;
            
            // String label
            this.ctx.fillStyle = this.colors.stringLabel;
            this.ctx.font = '600 13px "JetBrains Mono", monospace';
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(stringNames[5 - s], startX - 12, sy);

            // String line
            this.ctx.beginPath();
            this.ctx.strokeStyle = this.colors.string;
            this.ctx.lineWidth = 1 + (5 - s) * 0.15;
            this.ctx.moveTo(startX, sy);
            this.ctx.lineTo(endX, sy);
            this.ctx.stroke();
        }

        // Draw bar lines based on measures
        for (let m = 0; m <= measuresPerLine; m++) {
            const barTime = lineStartTime + m * measureDuration;
            const bx = timeToX(barTime);
            
            this.ctx.beginPath();
            this.ctx.strokeStyle = this.colors.barLine;
            this.ctx.lineWidth = (m === 0 || m === measuresPerLine) ? 2 : 1;
            this.ctx.moveTo(bx, y);
            this.ctx.lineTo(bx, y + 5 * this.stringSpacing);
            this.ctx.stroke();
            
            // Draw measure number
            if (m === 0) {
                this.ctx.fillStyle = this.colors.measureNumber;
                this.ctx.font = '500 11px "Inter", sans-serif';
                this.ctx.textAlign = 'left';
                const measureNum = lineIndex * measuresPerLine + 1;
                this.ctx.fillText(`m.${measureNum}`, bx, y - 10);
            }
        }

        // Draw notes and sustain lines
        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            const x = timeToX(note.startTime);
            const maxX = Math.min(timeToX(note.endTime), endX); // cap at end of line
            const stringY = y + (5 - note.string) * this.stringSpacing;
            const fretStr = note.fret.toString();
            const textWidth = this.ctx.measureText(fretStr).width;
            
            // Draw sustain line (Step 3) if minimum length is reached
            const sustainStartX = x + textWidth / 2 + 4;
            if (maxX - sustainStartX > 10) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = this.colors.fretNumber;
                this.ctx.lineWidth = 1.5;
                this.ctx.moveTo(sustainStartX, stringY);
                this.ctx.lineTo(maxX, stringY);
                this.ctx.stroke();
                
                // End tick
                this.ctx.beginPath();
                this.ctx.moveTo(maxX, stringY - 4);
                this.ctx.lineTo(maxX, stringY + 4);
                this.ctx.stroke();
            }

            // Background for fret number
            this.ctx.fillStyle = this.colors.bg;
            this.ctx.fillRect(
                x - textWidth / 2 - 4,
                stringY - 9,
                textWidth + 8,
                18
            );

            // Fret number glow
            this.ctx.shadowColor = 'rgba(129, 140, 248, 0.4)';
            this.ctx.shadowBlur = 6;
            
            // Fret number
            this.ctx.fillStyle = this.colors.fretNumber;
            this.ctx.font = '600 14px "JetBrains Mono", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(fretStr, x, stringY);
            
            this.ctx.shadowBlur = 0;
        }
    }

    renderEmptyState() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = 800 * dpr;
        this.canvas.height = 200 * dpr;
        this.canvas.style.width = '800px';
        this.canvas.style.height = '200px';
        this.ctx.scale(dpr, dpr);

        this.ctx.fillStyle = this.colors.bg;
        this.ctx.fillRect(0, 0, 800, 200);

        this.ctx.fillStyle = '#6868a0';
        this.ctx.font = '500 16px "Inter", sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('음표가 감지되지 않았습니다. 감도를 조절해보세요.', 400, 100);
    }
}

/**
 * WaveformRenderer - Draws audio waveform on canvas
 */
export class WaveformRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.audioData = null;
        this.duration = 0;
        this.playbackPosition = 0;
    }

    setAudioData(audioData, duration) {
        this.audioData = audioData;
        this.duration = duration;
        this.render();
    }

    setPlaybackPosition(position) {
        this.playbackPosition = position;
        this.render();
    }

    render() {
        if (!this.audioData) return;

        const dpr = window.devicePixelRatio || 1;
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.ctx.scale(dpr, dpr);

        // Clear
        this.ctx.fillStyle = '#12121a';
        this.ctx.fillRect(0, 0, width, height);

        const data = this.audioData;
        const step = Math.max(1, Math.floor(data.length / width));
        const midY = height / 2;
        const amplitude = height * 0.4;

        // Draw waveform
        const gradient = this.ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, '#818cf8');
        gradient.addColorStop(0.5, '#a78bfa');
        gradient.addColorStop(1, '#c084fc');

        const playX = (this.playbackPosition / this.duration) * width;

        // Played portion
        this.ctx.beginPath();
        this.ctx.strokeStyle = gradient;
        this.ctx.lineWidth = 1.5;

        for (let x = 0; x < width; x++) {
            const dataIdx = Math.floor((x / width) * data.length);
            
            // Get min/max in this bucket
            let min = 1, max = -1;
            for (let j = 0; j < step; j++) {
                const val = data[dataIdx + j] || 0;
                if (val < min) min = val;
                if (val > max) max = val;
            }

            const y1 = midY + min * amplitude;
            const y2 = midY + max * amplitude;

            if (x <= playX) {
                this.ctx.globalAlpha = 1;
            } else {
                this.ctx.globalAlpha = 0.3;
            }

            this.ctx.beginPath();
            this.ctx.moveTo(x, y1);
            this.ctx.lineTo(x, y2);
            this.ctx.stroke();
        }

        this.ctx.globalAlpha = 1;

        // Playback head
        if (this.playbackPosition > 0) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;
            this.ctx.moveTo(playX, 0);
            this.ctx.lineTo(playX, height);
            this.ctx.stroke();

            // Glow
            this.ctx.beginPath();
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            this.ctx.lineWidth = 6;
            this.ctx.moveTo(playX, 0);
            this.ctx.lineTo(playX, height);
            this.ctx.stroke();
        }

        // Center line
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(129, 140, 248, 0.1)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([4, 4]);
        this.ctx.moveTo(0, midY);
        this.ctx.lineTo(width, midY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    /**
     * Get time at click X position
     */
    getTimeAtX(clientX) {
        const rect = this.canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        return (x / rect.width) * this.duration;
    }
}
