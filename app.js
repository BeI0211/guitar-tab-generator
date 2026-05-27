/**
 * App.js - Main application logic for Guitar Tab Generator
 * v2.0 - Stem Separation + Multi-Instrument Tab Generation
 */
import { PitchDetector, NoteUtils } from './pitch-detector.js';
import { TabGenerator } from './tab-generator.js';
import { TabRenderer, WaveformRenderer } from './tab-renderer.js';
import { GuitarSynth } from './guitar-synth.js';
import { FretboardRenderer } from './fretboard-renderer.js';

(function() {
    'use strict';

    const PYTHON_BACKEND = 'http://127.0.0.1:8000';

    // ============ DOM Elements ============
    const uploadSection = document.getElementById('upload-section');
    const playerSection = document.getElementById('player-section');
    const progressSection = document.getElementById('progress-section');
    const resultsSection = document.getElementById('results-section');
    const stemMixerSection = document.getElementById('stem-mixer-section');

    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');

    const fileName = document.getElementById('file-name');
    const fileMeta = document.getElementById('file-meta');
    const changeFileBtn = document.getElementById('change-file-btn');

    const waveformCanvas = document.getElementById('waveform-canvas');
    const playBtn = document.getElementById('play-btn');
    const stopBtn = document.getElementById('stop-btn');
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');
    const volumeSlider = document.getElementById('volume-slider');
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');

    const tuningSelect = document.getElementById('tuning-select');
    const sensitivitySlider = document.getElementById('sensitivity-slider');
    const sensitivityValue = document.getElementById('sensitivity-value');
    const minNoteSlider = document.getElementById('min-note-slider');
    const minNoteValue = document.getElementById('min-note-value');
    const capoSelect = document.getElementById('capo-select');

    const analyzeBtn = document.getElementById('analyze-btn');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    const noteCount = document.getElementById('note-count');
    const detectedKey = document.getElementById('detected-key');
    const detectedBpm = document.getElementById('detected-bpm');
    const analysisTime = document.getElementById('analysis-time');

    // Legacy backward-compat elements (hidden)
    const tabCanvas = document.getElementById('tab-canvas');
    const textTab = document.getElementById('text-tab');
    const playerContainer = document.getElementById('player-container');
    const synthPlayBtn = document.getElementById('synth-play-btn');
    const synthStopBtn = document.getElementById('synth-stop-btn');
    const playerStatus = document.getElementById('player-status');

    const copyBtn = document.getElementById('copy-btn');
    const downloadBtn = document.getElementById('download-btn');
    const reanalyzeBtn = document.getElementById('reanalyze-btn');

    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    // Stem Mixer Elements
    const stemAnalyzeBtn = document.getElementById('stem-analyze-btn');
    const stemGrid = document.getElementById('stem-grid');

    // ============ State ============
    let audioContext = null;
    let audioBuffer = null;
    let sourceNode = null;
    let gainNode = null;
    let isPlaying = false;
    let startedAt = 0;
    let pausedAt = 0;
    let animationFrameId = null;

    let waveformRenderer = null;
    let currentFile = null;
    let stemUrls = null; // { vocals: url, guitar: url, bass: url, piano: url, drums: url, other: url }

    // Per-instrument state
    const instruments = {};
    // instruments.guitar = { tabRenderer, fretboardRenderer, guitarSynth, lastResult, synthIsPlaying, ... }

    let previewAudio = null; // For stem preview playback

    // ============ Initialize ============
    function init() {
        waveformRenderer = new WaveformRenderer(waveformCanvas);

        // Initialize per-instrument renderers
        initInstrument('guitar');
        initInstrument('bass');
        initInstrument('vocals');
        initInstrument('piano');

        setupEventListeners();
    }

    function initInstrument(name) {
        const canvasEl = document.getElementById(`tab-canvas-${name}`);
        const fretCanvasId = `fretboardCanvas-${name}`;
        
        instruments[name] = {
            tabRenderer: canvasEl ? new TabRenderer(canvasEl) : null,
            fretboardRenderer: document.getElementById(fretCanvasId) ? new FretboardRenderer(fretCanvasId) : null,
            guitarSynth: (name === 'guitar' || name === 'bass') ? new GuitarSynth() : null,
            lastResult: null,
            synthIsPlaying: false,
            synthStartTime: 0,
            synthAnimationId: null,
            synthNotesQueue: [],
            activeVisualNotes: []
        };
    }

    function setupEventListeners() {
        // File upload
        uploadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
        uploadArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect);
        changeFileBtn.addEventListener('click', () => fileInput.click());

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                handleFile(e.dataTransfer.files[0]);
            }
        });

        // Audio controls
        playBtn.addEventListener('click', togglePlayback);
        stopBtn.addEventListener('click', stopPlayback);
        volumeSlider.addEventListener('input', updateVolume);

        // Waveform click to seek
        waveformCanvas.addEventListener('click', (e) => {
            if (audioBuffer) {
                const time = waveformRenderer.getTimeAtX(e.clientX);
                seekTo(time);
            }
        });

        // Settings
        sensitivitySlider.addEventListener('input', () => {
            sensitivityValue.textContent = sensitivitySlider.value;
        });
        minNoteSlider.addEventListener('input', () => {
            minNoteValue.textContent = minNoteSlider.value + 'ms';
        });

        // Original Analyze button (sends to backend for separation)
        analyzeBtn.addEventListener('click', startSeparation);

        // Stem Mixer: Analyze selected stems
        if (stemAnalyzeBtn) {
            stemAnalyzeBtn.addEventListener('click', analyzeSelectedStems);
        }

        // Stem preview buttons
        if (stemGrid) {
            stemGrid.addEventListener('click', (e) => {
                const btn = e.target.closest('.stem-preview-btn');
                if (btn) {
                    const stemName = btn.dataset.stem;
                    toggleStemPreview(stemName, btn);
                }
            });
        }

        // Instrument tab switching
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                const tabId = e.target.dataset.tab;
                switchInstrumentTab(tabId, e.target);
            }
        });

        // Per-instrument synth play/stop
        document.querySelectorAll('[id^="synth-play-btn-"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const inst = btn.dataset.instrument;
                if (inst) startInstrumentSynthPlayback(inst);
            });
        });
        document.querySelectorAll('[id^="synth-stop-btn-"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const inst = btn.dataset.instrument;
                if (inst) stopInstrumentSynthPlayback(inst);
            });
        });

        // Result actions
        copyBtn.addEventListener('click', copyTab);
        downloadBtn.addEventListener('click', downloadTab);
        reanalyzeBtn.addEventListener('click', () => {
            resultsSection.classList.add('hidden');
            stemMixerSection.classList.remove('hidden');
            window.scrollTo({ top: stemMixerSection.offsetTop - 20, behavior: 'smooth' });
        });

        // Window resize
        window.addEventListener('resize', () => {
            if (audioBuffer) {
                waveformRenderer.render();
            }
            for (const inst of Object.values(instruments)) {
                if (inst.fretboardRenderer) inst.fretboardRenderer.resize();
            }
        });
    }

    // ============ File Handling ============
    function handleFileSelect(e) {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    }

    async function handleFile(file) {
        if (!file.type.startsWith('audio/')) {
            showToast('오디오 파일만 지원됩니다.');
            return;
        }

        currentFile = file;

        // Show player section
        uploadSection.classList.add('hidden');
        playerSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');
        progressSection.classList.add('hidden');
        stemMixerSection.classList.add('hidden');

        // Update file info
        fileName.textContent = file.name;
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        fileMeta.textContent = `${sizeMB} MB · ${file.type}`;

        // Decode audio
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            showToast('오디오 파일을 로드하고 있습니다...');

            const arrayBuffer = await file.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // Update duration
            const duration = audioBuffer.duration;
            totalTimeEl.textContent = formatTime(duration);
            fileMeta.textContent = `${sizeMB} MB · ${formatTime(duration)} · ${audioBuffer.sampleRate}Hz`;

            // Setup gain node
            if (!gainNode) {
                gainNode = audioContext.createGain();
                gainNode.connect(audioContext.destination);
            }
            updateVolume();

            // Render waveform
            const channelData = audioBuffer.getChannelData(0);
            waveformRenderer.setAudioData(channelData, duration);

            showToast('오디오가 로드되었습니다!');
        } catch (err) {
            console.error('Audio decode error:', err);
            showToast('오디오 파일을 읽을 수 없습니다: ' + err.message);
            uploadSection.classList.remove('hidden');
            playerSection.classList.add('hidden');
        }
    }

    // ============ Playback ============
    function togglePlayback() {
        if (isPlaying) {
            pausePlayback();
        } else {
            startPlayback();
        }
    }

    function startPlayback() {
        if (!audioBuffer) return;
        
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(gainNode);

        const offset = pausedAt;
        sourceNode.start(0, offset);
        startedAt = audioContext.currentTime - offset;

        isPlaying = true;
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');

        sourceNode.onended = () => {
            if (isPlaying) {
                stopPlayback();
            }
        };

        updatePlaybackUI();
    }

    function pausePlayback() {
        if (!isPlaying) return;
        
        pausedAt = audioContext.currentTime - startedAt;
        sourceNode.stop();
        isPlaying = false;
        
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        
        cancelAnimationFrame(animationFrameId);
    }

    function stopPlayback() {
        if (sourceNode && isPlaying) {
            sourceNode.stop();
        }
        isPlaying = false;
        pausedAt = 0;
        startedAt = 0;
        
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        currentTimeEl.textContent = '0:00';
        
        cancelAnimationFrame(animationFrameId);
        waveformRenderer.setPlaybackPosition(0);
    }

    function seekTo(time) {
        const wasPlaying = isPlaying;
        if (isPlaying) {
            sourceNode.stop();
            isPlaying = false;
        }
        
        pausedAt = Math.max(0, Math.min(time, audioBuffer.duration));
        waveformRenderer.setPlaybackPosition(pausedAt);
        currentTimeEl.textContent = formatTime(pausedAt);
        
        if (wasPlaying) {
            startPlayback();
        }
    }

    function updatePlaybackUI() {
        if (!isPlaying) return;
        
        const currentTime = audioContext.currentTime - startedAt;
        currentTimeEl.textContent = formatTime(currentTime);
        waveformRenderer.setPlaybackPosition(currentTime);
        
        animationFrameId = requestAnimationFrame(updatePlaybackUI);
    }

    function updateVolume() {
        if (gainNode) {
            gainNode.gain.value = volumeSlider.value / 100;
        }
    }

    // ============ Stem Separation (NEW) ============
    async function startSeparation() {
        if (!currentFile) {
            showToast('먼저 오디오 파일을 업로드하세요.');
            return;
        }

        stopPlayback();

        // Show progress
        playerSection.classList.add('hidden');
        progressSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');
        stemMixerSection.classList.add('hidden');

        try {
            updateProgress(0, 'Python AI 백엔드에 파일을 전송 중...', 'step-load');
            
            const formData = new FormData();
            formData.append('file', currentFile);

            updateProgress(10, 'Demucs AI 음원 분리 진행 중... (1~3분 소요)', 'step-pitch');

            const response = await fetch(`${PYTHON_BACKEND}/separate`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.details || `서버 오류: ${response.status}`);
            }

            const data = await response.json();
            stemUrls = data.stems;

            updateProgress(80, '음원 분리 완료!', 'step-pitch', true);
            updateProgress(90, '스템 믹서를 준비 중...', 'step-notes');

            await sleep(500);
            updateProgress(100, '완료! 트랙을 선택하세요.', 'step-tab', true);
            await sleep(300);

            // Show stem mixer
            progressSection.classList.add('hidden');
            stemMixerSection.classList.remove('hidden');
            playerSection.classList.remove('hidden');

            // Update available stems in UI
            updateStemAvailability();

            showToast('음원 분리가 완료되었습니다! 트랙을 선택하세요. 🎛️');
            window.scrollTo({ top: stemMixerSection.offsetTop - 20, behavior: 'smooth' });

        } catch (err) {
            console.error('Separation error:', err);
            showToast('음원 분리 중 오류: ' + err.message);
            progressSection.classList.add('hidden');
            playerSection.classList.remove('hidden');
        }
    }

    function updateStemAvailability() {
        if (!stemUrls) return;
        const tracks = document.querySelectorAll('.stem-track');
        tracks.forEach(track => {
            const stem = track.dataset.stem;
            const checkbox = track.querySelector('input[type="checkbox"]');
            if (stemUrls[stem]) {
                track.style.opacity = '1';
                if (checkbox && !checkbox.disabled) checkbox.disabled = false;
            } else {
                track.style.opacity = '0.4';
                if (checkbox) checkbox.disabled = true;
                if (checkbox) checkbox.checked = false;
            }
        });
    }

    // ============ Stem Preview ============
    function toggleStemPreview(stemName, btn) {
        if (!stemUrls || !stemUrls[stemName]) {
            showToast('이 트랙은 사용할 수 없습니다.');
            return;
        }

        // Stop any currently playing preview
        if (previewAudio) {
            previewAudio.pause();
            previewAudio = null;
            document.querySelectorAll('.stem-preview-btn.playing').forEach(b => b.classList.remove('playing'));
        }

        if (btn.classList.contains('playing')) {
            btn.classList.remove('playing');
            btn.textContent = '▶';
            return;
        }

        btn.classList.add('playing');
        btn.textContent = '⏸';

        previewAudio = new Audio(stemUrls[stemName]);
        previewAudio.volume = 0.8;
        previewAudio.play().catch(err => {
            console.error('Preview error:', err);
            showToast('미리듣기 오류: ' + err.message);
        });

        previewAudio.onended = () => {
            btn.classList.remove('playing');
            btn.textContent = '▶';
            previewAudio = null;
        };
    }

    // ============ Analyze Selected Stems ============
    async function analyzeSelectedStems() {
        if (!stemUrls) {
            showToast('먼저 음원 분리를 실행하세요.');
            return;
        }

        // Stop previews
        if (previewAudio) { previewAudio.pause(); previewAudio = null; }

        const selectedStems = {};
        ['vocals', 'guitar', 'bass', 'piano', 'other'].forEach(stem => {
            const checkbox = document.getElementById(`stem-${stem}`);
            if (checkbox && checkbox.checked && stemUrls[stem]) {
                selectedStems[stem] = stemUrls[stem];
            }
        });

        if (Object.keys(selectedStems).length === 0) {
            showToast('최소 하나의 트랙을 선택하세요.');
            return;
        }

        // Show progress
        stemMixerSection.classList.add('hidden');
        progressSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');

        const startTime = performance.now();

        // Reset progress steps
        document.querySelectorAll('.progress-steps .step').forEach(s => {
            s.classList.remove('active', 'done');
        });

        try {
            const stemKeys = Object.keys(selectedStems);
            const totalSteps = stemKeys.length;
            let completedSteps = 0;

            // Clear previous results per instrument
            for (const key of ['guitar', 'bass', 'vocals', 'piano']) {
                instruments[key].lastResult = null;
            }

            for (const stemName of stemKeys) {
                const stemUrl = selectedStems[stemName];
                const pctBase = (completedSteps / totalSteps) * 100;
                const pctRange = 100 / totalSteps;

                updateProgress(pctBase, `[${stemName}] 스템 오디오 다운로드 중...`);

                // Fetch and decode the separated stem audio
                const stemResponse = await fetch(stemUrl);
                const stemArrayBuf = await stemResponse.arrayBuffer();

                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                const stemAudioBuffer = await audioContext.decodeAudioData(stemArrayBuf);

                updateProgress(pctBase + pctRange * 0.2, `[${stemName}] AI 피치 분석 중...`);

                // Run pitch detection on this stem
                const pitchDetector = new PitchDetector();
                const sensitivity = parseInt(sensitivitySlider.value);
                const minNoteMs = parseInt(minNoteSlider.value);

                const notes = await pitchDetector.processAudio(
                    stemAudioBuffer,
                    sensitivity,
                    minNoteMs / 1000,
                    (pct, text) => {
                        updateProgress(pctBase + pctRange * (0.2 + pct * 0.6), 
                            `[${stemName}] ${text || 'AI 분석 중...'}`);
                    }
                );

                updateProgress(pctBase + pctRange * 0.85, `[${stemName}] TAB 변환 중...`);

                // Determine the target instrument for this stem
                let targetInstrument = stemName;
                // Map 'other' to guitar, 'piano' to guitar (piano→guitar translation)
                if (stemName === 'other') targetInstrument = 'guitar';

                const tabGen = new TabGenerator(
                    tuningSelect.value,
                    parseInt(capoSelect.value)
                );

                const result = tabGen.generateFromNotes(notes);

                // Store result in the correct instrument slot
                if (instruments[targetInstrument]) {
                    instruments[targetInstrument].lastResult = result;
                }

                // Render to the per-instrument canvas and text area
                const instTabRenderer = instruments[targetInstrument]?.tabRenderer;
                if (instTabRenderer) {
                    instTabRenderer.render(result.tabNotes, tabGen.stringNames, result.bpm);
                }

                const instTextTab = document.getElementById(`text-tab-${targetInstrument}`);
                if (instTextTab) {
                    instTextTab.textContent = result.textTab;
                }

                completedSteps++;
                updateProgress((completedSteps / totalSteps) * 100, 
                    `[${stemName}] 완료 (${result.noteCount}개 음표)`);
            }

            // Summary info (use guitar result as primary, fallback to first available)
            const primaryResult = instruments.guitar.lastResult || 
                                  instruments.bass.lastResult || 
                                  instruments.vocals.lastResult || 
                                  instruments.piano.lastResult;

            if (primaryResult) {
                noteCount.textContent = primaryResult.noteCount;
                detectedKey.textContent = primaryResult.key;
                detectedBpm.textContent = primaryResult.bpm;
            }

            // Also set legacy elements for backward compat
            if (instruments.guitar.lastResult) {
                if (textTab) textTab.textContent = instruments.guitar.lastResult.textTab;
            }

            const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
            analysisTime.textContent = elapsed + 's';

            await sleep(500);

            // Show results
            progressSection.classList.add('hidden');
            resultsSection.classList.remove('hidden');
            playerSection.classList.remove('hidden');

            // Activate tab buttons that have data
            updateTabButtonStates();

            // Show virtual player for instruments that have data
            for (const [name, inst] of Object.entries(instruments)) {
                const playerEl = document.getElementById(`player-container-${name}`);
                if (playerEl && inst.lastResult && inst.lastResult.tabNotes.length > 0) {
                    playerEl.style.display = 'block';
                    if (inst.fretboardRenderer) {
                        setTimeout(() => inst.fretboardRenderer.resize(), 100);
                    }
                }
            }

            window.scrollTo({ top: resultsSection.offsetTop - 20, behavior: 'smooth' });
            showToast('악기별 TAB 악보가 생성되었습니다! 🎸');

        } catch (err) {
            console.error('Analysis error:', err);
            showToast('분석 중 오류가 발생했습니다: ' + err.message);
            progressSection.classList.add('hidden');
            stemMixerSection.classList.remove('hidden');
            playerSection.classList.remove('hidden');
        }
    }

    function updateTabButtonStates() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const tabId = btn.dataset.tab;
            // tabId is like "guitar-tab" → instrument name is "guitar"
            const instName = tabId?.replace('-tab', '');
            if (instName && instruments[instName]?.lastResult) {
                btn.classList.add('has-data');
            } else {
                btn.classList.remove('has-data');
            }
        });

        // Auto-select the first tab that has data
        const firstWithData = document.querySelector('.tab-btn.has-data');
        if (firstWithData) {
            switchInstrumentTab(firstWithData.dataset.tab, firstWithData);
        }
    }

    function switchInstrumentTab(tabId, btn) {
        // Deactivate all
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

        // Activate clicked
        if (btn) btn.classList.add('active');
        const panel = document.getElementById(tabId);
        if (panel) panel.classList.add('active');
    }

    // ============ Progress ============
    function updateProgress(percent, text, stepId = null, done = false) {
        progressBar.style.width = percent + '%';
        progressText.textContent = text;

        if (stepId) {
            const step = document.getElementById(stepId);
            if (step) {
                if (done) {
                    step.classList.remove('active');
                    step.classList.add('done');
                    const nextStep = step.nextElementSibling;
                    if (nextStep) nextStep.classList.add('active');
                } else {
                    step.classList.add('active');
                }
            }
        }
    }

    // ============ Actions ============
    function copyTab() {
        // Find the currently active tab's text
        const activePanel = document.querySelector('.tab-panel.active');
        const activeTextTab = activePanel?.querySelector('.text-tab');
        const textContent = activeTextTab?.textContent || '';

        if (!textContent) {
            showToast('복사할 악보가 없습니다.');
            return;
        }
        
        navigator.clipboard.writeText(textContent).then(() => {
            showToast('TAB이 클립보드에 복사되었습니다!');
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = textContent;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('TAB이 복사되었습니다!');
        });
    }

    function downloadTab() {
        // Collect all tabs with data
        let content = `Guitar Tab - Generated by Guitar Tab Generator\n`;
        content += `======================================================\n\n`;
        content += `Tuning: ${tuningSelect.options[tuningSelect.selectedIndex].text}\n`;
        content += `Capo: ${capoSelect.options[capoSelect.selectedIndex].text}\n\n`;

        for (const [name, inst] of Object.entries(instruments)) {
            if (inst.lastResult) {
                const label = { guitar: '🎸 기타', bass: '🎸 베이스', vocals: '🎤 보컬 멜로디', piano: '🎹 피아노→기타' }[name] || name;
                content += `\n${'='.repeat(54)}\n`;
                content += `  ${label}\n`;
                content += `${'='.repeat(54)}\n`;
                content += `Key: ${inst.lastResult.key} | BPM: ${inst.lastResult.bpm} | Notes: ${inst.lastResult.noteCount}\n\n`;
                content += inst.lastResult.textTab + '\n';
            }
        }

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'guitar-tab-all-parts.txt';
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('전체 파트 TAB 파일이 다운로드되었습니다!');
    }

    // ============ Per-Instrument Synth Playback ============
    async function startInstrumentSynthPlayback(instName) {
        const inst = instruments[instName];
        if (!inst || !inst.lastResult || !inst.lastResult.tabNotes.length) return;
        if (inst.synthIsPlaying) return;

        const playBtnEl = document.getElementById(`synth-play-btn-${instName}`);
        const statusEl = document.getElementById(`player-status-${instName}`);

        try {
            if (playBtnEl) playBtnEl.disabled = true;
            if (statusEl) statusEl.textContent = "오디오 폰트 로딩 중...";
            
            if (!inst.guitarSynth) {
                inst.guitarSynth = new GuitarSynth();
            }

            await inst.guitarSynth.init((msg) => {
                if (statusEl) statusEl.textContent = msg;
            });
            
            inst.synthIsPlaying = true;
            if (playBtnEl) playBtnEl.innerHTML = "⏸ 연주 중";
            if (statusEl) statusEl.textContent = "🎵 연주 중...";
            
            inst.synthNotesQueue = inst.lastResult.tabNotes.map(n => ({
                ...n,
                played: false
            })).sort((a,b) => a.startTime - b.startTime);
            
            inst.activeVisualNotes = [];
            
            const offset = inst.synthNotesQueue.length > 0 ? inst.synthNotesQueue[0].startTime - 0.2 : 0;
            inst.synthStartTime = inst.guitarSynth.getCurrentTime() - Math.max(0, offset);
            
            instrumentSynthLoop(instName);
        } catch(e) {
            console.error(e);
            showToast("신디사이저 오류: " + e.message);
            if (playBtnEl) playBtnEl.disabled = false;
            if (statusEl) statusEl.textContent = "에러 발생";
        }
    }

    function stopInstrumentSynthPlayback(instName) {
        const inst = instruments[instName];
        if (!inst || !inst.synthIsPlaying) return;
        
        inst.synthIsPlaying = false;
        cancelAnimationFrame(inst.synthAnimationId);
        
        if (inst.guitarSynth) inst.guitarSynth.stopAll();
        if (inst.fretboardRenderer) {
            inst.fretboardRenderer.setActiveNotes([]);
            inst.fretboardRenderer.draw();
        }
        
        const playBtnEl = document.getElementById(`synth-play-btn-${instName}`);
        const statusEl = document.getElementById(`player-status-${instName}`);
        if (playBtnEl) { playBtnEl.disabled = false; playBtnEl.innerHTML = "▶ 연주 시작"; }
        if (statusEl) statusEl.textContent = "대기 중";
    }

    function instrumentSynthLoop(instName) {
        const inst = instruments[instName];
        if (!inst || !inst.synthIsPlaying) return;
        
        const now = inst.guitarSynth.getCurrentTime() - inst.synthStartTime;
        
        let allDone = true;
        
        for (let note of inst.synthNotesQueue) {
            if (!note.played && now >= note.startTime) {
                inst.guitarSynth.playNote(note.midi, 0, (note.endTime - note.startTime) || 1.0);
                note.played = true;
                
                inst.activeVisualNotes.push({
                    ...note,
                    opacity: 1.0
                });
            }
            if (!note.played) {
                allDone = false;
            }
        }
        
        const newActive = [];
        for (let vNote of inst.activeVisualNotes) {
            if (now >= vNote.startTime && now <= vNote.endTime + 0.4) {
                if (now > vNote.endTime) {
                    vNote.opacity = Math.max(0, 1.0 - (now - vNote.endTime) * 2.5);
                }
                if (vNote.opacity > 0.05) {
                    newActive.push(vNote);
                }
            }
        }
        inst.activeVisualNotes = newActive;
        
        if (inst.fretboardRenderer) {
            inst.fretboardRenderer.setActiveNotes(inst.activeVisualNotes);
            inst.fretboardRenderer.draw();
        }
        
        const lastNote = inst.synthNotesQueue[inst.synthNotesQueue.length - 1];
        if (allDone && inst.activeVisualNotes.length === 0 && lastNote && now > lastNote.endTime + 1) {
            stopInstrumentSynthPlayback(instName);
            const statusEl = document.getElementById(`player-status-${instName}`);
            if (statusEl) statusEl.textContent = "연주 완료 🎉";
            return;
        }
        
        inst.synthAnimationId = requestAnimationFrame(() => instrumentSynthLoop(instName));
    }

    // ============ Utilities ============
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function showToast(message) {
        toastMessage.textContent = message;
        toast.classList.remove('hidden');
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 3000);
    }

    // ============ Start ============
    document.addEventListener('DOMContentLoaded', init);
})();
