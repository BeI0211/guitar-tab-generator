/**
 * App.js - Main application logic for Guitar Tab Generator
 */
(function() {
    'use strict';

    // ============ DOM Elements ============
    const uploadSection = document.getElementById('upload-section');
    const playerSection = document.getElementById('player-section');
    const progressSection = document.getElementById('progress-section');
    const resultsSection = document.getElementById('results-section');

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

    const tabCanvas = document.getElementById('tab-canvas');
    const textTab = document.getElementById('text-tab');

    const copyBtn = document.getElementById('copy-btn');
    const downloadBtn = document.getElementById('download-btn');
    const reanalyzeBtn = document.getElementById('reanalyze-btn');

    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

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
    let tabRenderer = null;
    let lastResult = null;

    // ============ Initialize ============
    function init() {
        waveformRenderer = new WaveformRenderer(waveformCanvas);
        tabRenderer = new TabRenderer(tabCanvas);
        
        setupEventListeners();
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

        // Analyze
        analyzeBtn.addEventListener('click', startAnalysis);

        // Result actions
        copyBtn.addEventListener('click', copyTab);
        downloadBtn.addEventListener('click', downloadTab);
        reanalyzeBtn.addEventListener('click', () => {
            resultsSection.classList.add('hidden');
            playerSection.classList.remove('hidden');
            window.scrollTo({ top: playerSection.offsetTop - 20, behavior: 'smooth' });
        });

        // Window resize
        window.addEventListener('resize', () => {
            if (audioBuffer) {
                waveformRenderer.render();
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

        // Show player section
        uploadSection.classList.add('hidden');
        playerSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');
        progressSection.classList.add('hidden');

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

    // ============ Analysis ============
    async function startAnalysis() {
        if (!audioBuffer) {
            showToast('먼저 오디오 파일을 업로드하세요.');
            return;
        }

        // Stop playback
        stopPlayback();

        // Show progress
        playerSection.classList.add('hidden');
        progressSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');

        const startTime = performance.now();

        try {
            // Step 1: Load audio data
            updateProgress(0, '오디오 데이터를 준비하고 있습니다...', 'step-load');
            await sleep(200);

            const channelData = audioBuffer.getChannelData(0);
            updateProgress(15, '오디오 데이터 로드 완료', 'step-load', true);

            // Step 2: Pitch detection
            updateProgress(20, 'AI 음표 분석 모델(Basic Pitch)을 로딩 중입니다...', 'step-pitch');
            await sleep(100);

            const pitchDetector = new PitchDetector();
            const sensitivity = parseInt(sensitivitySlider.value);
            const minNoteMs = parseInt(minNoteSlider.value);

            // processAudio automatically downloads model if needed and handles progress
            const notes = await pitchDetector.processAudio(
                audioBuffer, 
                sensitivity, 
                minNoteMs / 1000, 
                (pct) => {
                    // pct is from 0 to 1
                    updateProgress(20 + pct * 40, `AI 다중 피치 분석 중... (${Math.round(pct * 100)}%)`);
                }
            );

            updateProgress(60, `${notes.length}개의 다중 음표 감지 완료`, 'step-pitch', true);

            // Step 3: Note analysis
            updateProgress(65, 'TAB 악보로 변환 중...', 'step-notes');
            await sleep(100);

            const tabGen = new TabGenerator(
                tuningSelect.value,
                parseInt(capoSelect.value)
            );
            // minNoteDuration is now handled by Basic Pitch layer

            const result = tabGen.generateFromNotes(notes);
            lastResult = result;

            updateProgress(80, `${result.noteCount}개의 음표 분석 완료`, 'step-notes', true);

            // Step 4: Generate TAB
            updateProgress(85, 'TAB 악보를 생성하고 있습니다...', 'step-tab');
            await sleep(200);

            // Render visual tab
            tabRenderer.render(result.tabNotes, tabGen.stringNames, result.bpm);

            // Set text tab
            textTab.textContent = result.textTab;

            // Set info
            noteCount.textContent = result.noteCount;
            detectedKey.textContent = result.key;
            detectedBpm.textContent = result.bpm;

            const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
            analysisTime.textContent = elapsed + 's';

            updateProgress(100, 'TAB 악보 생성 완료!', 'step-tab', true);
            await sleep(500);

            // Show results
            progressSection.classList.add('hidden');
            resultsSection.classList.remove('hidden');
            playerSection.classList.remove('hidden');

            window.scrollTo({ top: resultsSection.offsetTop - 20, behavior: 'smooth' });
            showToast('기타 TAB 악보가 생성되었습니다! 🎸');

        } catch (err) {
            console.error('Analysis error:', err);
            showToast('분석 중 오류가 발생했습니다: ' + err.message);
            progressSection.classList.add('hidden');
            playerSection.classList.remove('hidden');
        }
    }

    function updateProgress(percent, text, stepId = null, done = false) {
        progressBar.style.width = percent + '%';
        progressText.textContent = text;

        if (stepId) {
            const step = document.getElementById(stepId);
            if (done) {
                step.classList.remove('active');
                step.classList.add('done');
                // Activate next step
                const nextStep = step.nextElementSibling;
                if (nextStep) nextStep.classList.add('active');
            } else {
                step.classList.add('active');
            }
        }
    }

    // ============ Actions ============
    function copyTab() {
        if (!lastResult) return;
        
        navigator.clipboard.writeText(lastResult.textTab).then(() => {
            showToast('TAB이 클립보드에 복사되었습니다!');
        }).catch(() => {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = lastResult.textTab;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('TAB이 복사되었습니다!');
        });
    }

    function downloadTab() {
        if (!lastResult) return;

        const content = `Guitar Tab - Generated by Guitar Tab Generator\n`
            + `======================================================\n\n`
            + `Tuning: ${tuningSelect.options[tuningSelect.selectedIndex].text}\n`
            + `Capo: ${capoSelect.options[capoSelect.selectedIndex].text}\n`
            + `Key: ${lastResult.key}\n`
            + `BPM: ${lastResult.bpm}\n`
            + `Notes: ${lastResult.noteCount}\n\n`
            + `======================================================\n\n`
            + lastResult.textTab;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'guitar-tab.txt';
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('TAB 파일이 다운로드되었습니다!');
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
