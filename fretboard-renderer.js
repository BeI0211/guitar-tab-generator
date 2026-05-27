/**
 * FretboardRenderer - Renders interactive guitar neck and visualizes notes
 */
export class FretboardRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas with id ${canvasId} not found`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        
        // Settings
        this.numStrings = 6;
        this.numFrets = 22;
        this.stringSpacing = 0;
        this.fretSpacing = []; // Dynamic fret spacing (wider at nut)
        
        // State
        this.activeNotes = []; // Elements like {string: 0, fret: 5, startTime: 1.2, endTime: 1.5, opacity: 1}

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        // height = ~150px
        this.canvas.height = 150; 
        
        this.stringSpacing = this.canvas.height / (this.numStrings + 1);
        
        // Calculate dynamic fret spacing (Rule of 18 roughly)
        let remainingLength = this.canvas.width - 40; // 40px for nut area
        let currentX = 40;
        this.fretSpacing = [0]; // Fret 0 (Nut) is at index 0, position 20
        
        for (let i = 1; i <= this.numFrets; i++) {
            // Realistic guitar fret scaling: each fret is 1/17.817 of remaining length
            const fretWidth = remainingLength / 14; // Modified factor to fit canvas nicely
            currentX += fretWidth;
            remainingLength -= fretWidth;
            this.fretSpacing.push(currentX);
        }
        
        this.draw();
    }

    drawBaseFretboard() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Background Wood
        ctx.fillStyle = '#2c1e16'; // Dark rosewood color
        ctx.fillRect(40, 0, w - 40, h);
        
        // The Nut (0 fret area)
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, 40, h);
        ctx.fillStyle = '#e8dcc4'; // Bone nut
        ctx.fillRect(35, 2, 5, h - 4);

        // Fret wires
        ctx.strokeStyle = '#8a9b9e'; // Silver fret wire
        ctx.lineWidth = 2;
        for (let i = 1; i <= this.numFrets; i++) {
            const x = this.fretSpacing[i];
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }

        // Fret markers (dots)
        const dotFrets = [3, 5, 7, 9, 12, 15, 17, 19, 21];
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        
        for (const fret of dotFrets) {
            if (fret > this.numFrets) continue;
            
            const prevX = this.fretSpacing[fret - 1];
            const currX = this.fretSpacing[fret];
            const midX = prevX + (currX - prevX) / 2;
            const midY = h / 2;

            if (fret === 12 || fret === 24) {
                // Two dots
                ctx.beginPath();
                ctx.arc(midX, midY - this.stringSpacing * 1.5, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(midX, midY + this.stringSpacing * 1.5, 4, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Single dot
                ctx.beginPath();
                ctx.arc(midX, midY, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Strings
        for (let i = 0; i < this.numStrings; i++) {
            const y = (i + 1) * this.stringSpacing;
            // High strings are thinner, low strings thicker
            ctx.lineWidth = 0.5 + (i * 0.4);
            const isWound = i >= 3;
            ctx.strokeStyle = isWound ? '#b5a68d' : '#e0e0e0'; // Bronze wound vs Steel

            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
    }

    /**
     * @param {number} string 0-5 (high e to low E) Note: GUI commonly shows Low E on bottom, which is string 5!
     * @param {number} fret 0-22
     * @param {number} opacity 0.0 to 1.0 (for fading out)
     */
    drawNote(string, fret, opacity = 1) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        
        const y = (string + 1) * this.stringSpacing;
        let x;
        
        if (fret === 0) {
            x = 20; // Middle of nut area
        } else {
            const prevX = this.fretSpacing[fret - 1];
            const currX = this.fretSpacing[fret];
            x = prevX + (currX - prevX) * 0.6; // Slightly closer to the fret wire like real playing
        }

        // Drop shadow / glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = `rgba(0, 255, 128, ${opacity})`;

        // Note circle
        ctx.fillStyle = `rgba(0, 255, 128, ${opacity})`; // Neon green
        ctx.beginPath();
        ctx.arc(x, y, opacity * 8 + 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0; // reset
        
        // Inner white dot
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.beginPath();
        ctx.arc(x, y, opacity * 3 + 1, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw Fret number inside
        if (opacity > 0.5) {
            ctx.fillStyle = '#111';
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(fret.toString(), x, y);
        }
    }

    setActiveNotes(notes) {
        this.activeNotes = notes;
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBaseFretboard();
        
        for (const note of this.activeNotes) {
            // Note: our tab system usually considers string 0 = high E, which is visually the TOP string.
            // standard tab: Top = High E. Canvas visually string 0 = y-pos 1 = Top. This matches!
            this.drawNote(note.string, note.fret, note.opacity);
        }
    }
}
