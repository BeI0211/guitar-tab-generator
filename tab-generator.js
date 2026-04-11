/**
 * TabGenerator - Converts detected pitches to guitar tablature
 */
class TabGenerator {
    // Guitar tunings: MIDI note numbers for each string (low to high, string 6 to 1)
    static TUNINGS = {
        'standard': [40, 45, 50, 55, 59, 64],     // E2 A2 D3 G3 B3 E4
        'drop-d':   [38, 45, 50, 55, 59, 64],     // D2 A2 D3 G3 B3 E4
        'open-g':   [38, 43, 50, 55, 59, 62],     // D2 G2 D3 G3 B3 D4
        'open-d':   [38, 45, 50, 54, 57, 62],     // D2 A2 D3 F#3 A3 D4
        'dadgad':   [38, 45, 50, 55, 57, 62],     // D2 A2 D3 G3 A3 D4
    };

    static STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
    static MAX_FRET = 24;

    constructor(tuning = 'standard', capo = 0) {
        this.setTuning(tuning, capo);
        this.minNoteDuration = 0.08; // seconds
    }

    setTuning(tuning, capo = 0) {
        this.tuningName = tuning;
        this.capo = capo;
        this.openStrings = TabGenerator.TUNINGS[tuning].map(note => note + capo);
        
        // Update string names for non-standard tunings
        if (tuning === 'standard') {
            this.stringNames = ['E', 'A', 'D', 'G', 'B', 'e'];
        } else if (tuning === 'drop-d') {
            this.stringNames = ['D', 'A', 'D', 'G', 'B', 'e'];
        } else if (tuning === 'open-g') {
            this.stringNames = ['D', 'G', 'D', 'G', 'B', 'D'];
        } else if (tuning === 'open-d') {
            this.stringNames = ['D', 'A', 'D', 'F#', 'A', 'D'];
        } else if (tuning === 'dadgad') {
            this.stringNames = ['D', 'A', 'D', 'G', 'A', 'D'];
        }
    }

    getAvailablePositions(midiNote) {
        const positions = [];
        for (let s = 0; s < 6; s++) {
            const fret = midiNote - this.openStrings[s];
            if (fret >= 0 && fret <= TabGenerator.MAX_FRET) {
                positions.push({ string: s, fret: fret });
            }
        }
        return positions;
    }

    getValidChordCombinations(chordNotes) {
        let combos = [[]];
        for (const note of chordNotes) {
            const positions = this.getAvailablePositions(note.midi);
            const newCombos = [];
            for (const combo of combos) {
                const usedStrings = combo.map(c => c.string);
                for (const pos of positions) {
                    if (!usedStrings.includes(pos.string)) {
                        newCombos.push([...combo, { note, string: pos.string, fret: pos.fret }]);
                    }
                }
            }
            combos = newCombos;
            if (combos.length === 0) break;
        }
        return combos;
    }

    scoreChordCombination(combo, handPosition) {
        let maxFret = -1;
        let minFret = 999;
        let avgFret = 0;
        let nonOpenNotes = 0;
        let penalty = 0;

        for (const pos of combo) {
            if (pos.fret > 0) {
                if (pos.fret > maxFret) maxFret = pos.fret;
                if (pos.fret < minFret) minFret = pos.fret;
                avgFret += pos.fret;
                nonOpenNotes++;
            }
            // Base fret penalty (slight bias towards lower frets globally)
            penalty += pos.fret * 0.1;
        }
        
        if (nonOpenNotes > 0) {
            const stretch = maxFret - minFret;
            
            // 물리적인 기타 넥의 칸 넓이를 반영한 동적 벌림폭(Stretch) 계산
            // 로우 프렛(1~6)은 프렛 간격이 넓어 4칸(stretch=4, 예: 1~5프렛)이 한계
            // 미들 프렛(7~11)은 간격이 좁아져 5칸(stretch=5)까지 허용
            // 하이 프렛(12~)은 아주 좁으므로 6칸(stretch=6)까지 허용
            let allowedStretch = 4;
            if (minFret >= 7) allowedStretch = 5;
            if (minFret >= 12) allowedStretch = 6;

            if (stretch > allowedStretch) return Infinity; // Physically impossible stretch limit

            // Stretch distance penalty
            penalty += stretch * 1.5;

            // Hand position anchoring (to prevent jumps)
            const currHandPos = avgFret / nonOpenNotes;
            if (handPosition > 0) {
                const distance = Math.abs(currHandPos - handPosition);
                penalty += distance * 3.0; 
            }
        }
        return penalty;
    }

    /**
     * Convert notes to guitar tab positions (Smart Fingering)
     */
    notesToTab(notes) {
        const tabNotes = [];
        
        // 1. Group concurrent notes (within 50ms) into chords
        const chordEvents = [];
        let currentChord = [];
        for (const note of notes) {
            if (currentChord.length === 0) {
                currentChord.push(note);
            } else {
                if (Math.abs(note.startTime - currentChord[0].startTime) < 0.05) {
                    currentChord.push(note);
                } else {
                    chordEvents.push(currentChord);
                    currentChord = [note];
                }
            }
        }
        if (currentChord.length > 0) chordEvents.push(currentChord);

        // 2. Process each chord event
        let handPosition = 0;
        
        for (const chord of chordEvents) {
            let validCombos = this.getValidChordCombinations(chord);
            let currentTryNotes = [...chord];
            
            // Drop lowest probability notes if impossible physically
            while (currentTryNotes.length > 1) {
                let bestScoreInCurrent = Infinity;
                if (validCombos.length > 0) {
                    bestScoreInCurrent = Math.min(...validCombos.map(c => this.scoreChordCombination(c, handPosition)));
                }
                
                if (bestScoreInCurrent !== Infinity) {
                    break;
                }
                
                // Sort ascending by probability and remove the least confident note
                currentTryNotes.sort((a, b) => a.probability - b.probability);
                currentTryNotes.shift(); 
                validCombos = this.getValidChordCombinations(currentTryNotes);
            }

            if (validCombos.length === 0) continue;

            // Pick the best combination
            let bestCombo = null;
            let bestScore = Infinity;
            for (const combo of validCombos) {
                const score = this.scoreChordCombination(combo, handPosition);
                if (score < bestScore) {
                    bestScore = score;
                    bestCombo = combo;
                }
            }

            if (bestCombo) {
                let nonOpenCount = 0;
                let nonOpenSum = 0;
                for (const pos of bestCombo) {
                    tabNotes.push({
                        ...pos.note,
                        string: pos.string,
                        fret: pos.fret
                    });
                    if (pos.fret > 0) {
                        nonOpenSum += pos.fret;
                        nonOpenCount++;
                    }
                }
                
                // Smoothly update running hand position
                if (nonOpenCount > 0) {
                    const newPos = nonOpenSum / nonOpenCount;
                    handPosition = handPosition === 0 ? newPos : (handPosition * 0.4 + newPos * 0.6);
                }
            }
        }

        return tabNotes;
    }

    /**
     * Generate text-based tab from tab notes
     */
    generateTextTab(tabNotes, measuresPerLine = 4, bpm = '-') {
        if (tabNotes.length === 0) {
            return 'No notes detected. Try adjusting sensitivity or uploading a clearer audio file.';
        }

        // Determine time quantization
        let timeStep = 0.15; // default if no bpm
        if (bpm !== '-' && !isNaN(bpm) && bpm > 0) {
            const beatDuration = 60 / bpm;
            timeStep = beatDuration / 4; // 16th note resolution
        }
        const maxTime = tabNotes.length > 0 ? tabNotes[tabNotes.length - 1].startTime : 0;
        const totalColumns = Math.ceil(maxTime / timeStep) + 1;
        
        // Columns per measure
        const colsPerMeasure = 16;
        const colsPerLine = colsPerMeasure * measuresPerLine;
        
        let output = '';
        
        // Process in line chunks
        const totalLines = Math.ceil(totalColumns / colsPerLine);

        for (let lineIdx = 0; lineIdx < totalLines; lineIdx++) {
            const startCol = lineIdx * colsPerLine;
            const endCol = Math.min(startCol + colsPerLine, totalColumns);
            const lineWidth = endCol - startCol;
            
            // Initialize 6 strings
            const strings = [];
            for (let s = 0; s < 6; s++) {
                strings.push(new Array(lineWidth).fill('-'));
            }

            // Place notes in this time range
            for (const note of tabNotes) {
                const col = Math.floor(note.startTime / timeStep) - startCol;
                if (col >= 0 && col < lineWidth) {
                    const fretStr = note.fret.toString();
                    if (fretStr.length === 1) {
                        strings[note.string][col] = fretStr;
                    } else {
                        // Two digit fret
                        strings[note.string][col] = fretStr[0];
                        if (col + 1 < lineWidth) {
                            strings[note.string][col + 1] = fretStr[1];
                        }
                    }
                }
            }

            // Add measure bars
            for (let c = 0; c < lineWidth; c++) {
                if ((c + startCol) % colsPerMeasure === 0 && c > 0) {
                    for (let s = 0; s < 6; s++) {
                        if (strings[s][c] === '-') {
                            strings[s][c] = '|';
                        }
                    }
                }
            }

            // Build output for this line
            for (let s = 5; s >= 0; s--) {
                const label = this.stringNames[s].padEnd(2, ' ');
                output += `${label}|${strings[s].join('')}|\n`;
            }
            output += '\n';
        }

        return output;
    }

    /**
     * Detect approximate key from notes
     */
    detectKey(notes) {
        if (notes.length === 0) return '-';

        const noteCounts = new Array(12).fill(0);
        for (const note of notes) {
            const noteClass = note.midi % 12;
            noteCounts[noteClass]++;
        }

        // Major key profiles (Krumhansl-Kessler)
        const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
        const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
        
        let bestKey = 0;
        let bestScore = -Infinity;
        let isMinor = false;

        for (let key = 0; key < 12; key++) {
            // Rotate note counts
            const rotated = [];
            for (let i = 0; i < 12; i++) {
                rotated.push(noteCounts[(i + key) % 12]);
            }

            // Correlate with major profile
            let majorScore = this.correlate(rotated, majorProfile);
            let minorScore = this.correlate(rotated, minorProfile);

            if (majorScore > bestScore) {
                bestScore = majorScore;
                bestKey = key;
                isMinor = false;
            }
            if (minorScore > bestScore) {
                bestScore = minorScore;
                bestKey = key;
                isMinor = true;
            }
        }

        const keyName = NoteUtils.NOTE_NAMES[bestKey];
        return isMinor ? `${keyName}m` : keyName;
    }

    correlate(a, b) {
        let sum = 0;
        let meanA = 0, meanB = 0;
        for (let i = 0; i < a.length; i++) {
            meanA += a[i];
            meanB += b[i];
        }
        meanA /= a.length;
        meanB /= b.length;
        
        let numerator = 0, denomA = 0, denomB = 0;
        for (let i = 0; i < a.length; i++) {
            const dA = a[i] - meanA;
            const dB = b[i] - meanB;
            numerator += dA * dB;
            denomA += dA * dA;
            denomB += dB * dB;
        }
        
        const denom = Math.sqrt(denomA * denomB);
        return denom === 0 ? 0 : numerator / denom;
    }

    /**
     * Estimate BPM using onset detection
     */
    estimateBPM(notes) {
        if (notes.length < 4) return '-';

        // Calculate inter-onset intervals
        const intervals = [];
        for (let i = 1; i < notes.length; i++) {
            const interval = notes[i].startTime - notes[i - 1].startTime;
            if (interval > 0.1 && interval < 2.0) {
                intervals.push(interval);
            }
        }

        if (intervals.length === 0) return '-';

        // Find most common interval using histogram
        const binSize = 0.02;
        const bins = {};
        for (const interval of intervals) {
            const bin = Math.round(interval / binSize) * binSize;
            bins[bin] = (bins[bin] || 0) + 1;
        }

        let bestBin = 0;
        let bestCount = 0;
        for (const [bin, count] of Object.entries(bins)) {
            if (count > bestCount) {
                bestCount = count;
                bestBin = parseFloat(bin);
            }
        }

        if (bestBin === 0) return '-';

        // Convert to BPM
        let bpm = 60 / bestBin;
        
        // Normalize to reasonable range
        while (bpm > 200) bpm /= 2;
        while (bpm < 60) bpm *= 2;

        return Math.round(bpm);
    }

    /**
     * Full pipeline: notes → tab
     */
    generateFromNotes(notes) {
        // Sort notes chronologically
        notes.sort((a, b) => a.startTime - b.startTime);

        const bpm = this.estimateBPM(notes);
        const tabNotes = this.notesToTab(notes);
        const textTab = this.generateTextTab(tabNotes, 4, bpm);
        const key = this.detectKey(notes);

        return {
            notes,
            tabNotes,
            textTab,
            key,
            bpm,
            noteCount: notes.length
        };
    }
}

window.TabGenerator = TabGenerator;
