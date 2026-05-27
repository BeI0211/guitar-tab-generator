const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
    
    // mainWindow.webContents.openDevTools();

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

function startPythonBackend() {
    const pythonScript = path.join(__dirname, 'server.py');
    const pythonExecutable = path.join(__dirname, 'venv', 'bin', 'python3');
    
    pythonProcess = spawn(pythonExecutable, [pythonScript]);
    
    pythonProcess.stdout.on('data', (data) => {
        console.log(`[Python]: ${data}`);
    });
    
    pythonProcess.stderr.on('data', (data) => {
        console.error(`[Python Error]: ${data}`);
    });
    
    pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}`);
    });
}

app.whenReady().then(() => {
    startPythonBackend();
    createWindow();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    if (pythonProcess) {
        pythonProcess.kill();
    }
});
