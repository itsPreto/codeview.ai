const { app, BrowserWindow } = require('electron') 

function createWindow () {
  const win = new BrowserWindow({
    width: 1900,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      nodeIntegrationInSubFrames: true,
      nodeIntegrationInWorker: true,  
    }
  })

  win.loadFile('src/index.html')
}

app.whenReady().then(createWindow)