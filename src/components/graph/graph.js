// graph.js: Contains functions related to initializing and updating the graph.

import { allowOrbit, getOrbitAllowed } from '../../utils.js';

console.log("Using function from utils.js", getOrbitAllowed());

export const elem = document.getElementById('3d-graph');

export const Graph = ForceGraph3D({ controlType: 'orbit' })(elem)

export const chatbox = document.getElementById('messages')

export const terminalOutput = document.getElementById('terminal-output');

export const graphContainer = document.getElementById('graph-container');

export const searchResults = document.getElementById('search-results');

export const graphName = document.getElementById('graph-name');

export const topButton = document.getElementById('navUp-bttn');

export const saveButton = document.getElementById('save-button');
  
export const searchBar = document.getElementById('search-bar');
  
export const fullscreenButton = document.getElementById('fullscreen-bttn');

export const settingsIcon = document.getElementById('settings-icon');
  
export const sendButton = document.getElementById('send-button');

export const chatboxContainer = document.getElementById('chatbox-container');

export const searchContainer = document.getElementById('search-container');

export const codeEditor = document.getElementById('code-editor');

export const messages = document.getElementById('messages')

export const settingsBtn = document.getElementById('settings-icon')
  
export const userInputField = document.getElementById('user-input');

export const overlay = document.getElementById('overlay')

export const loadingSpinner = document.getElementById('loading-spinner')

export const percentComplete = document.getElementById('percent-complete')

export const localPathBtn = document.getElementById('local_path_btn')

export const cloneRepoBtn = document.getElementById('clone_repo_btn')

export const repoUrlsInput = document.getElementById('repo-urls-input')

export const localPathInput = document.getElementById('local-path-input')

export const inputForm = document.getElementById('input-form')

export const container = document.getElementById('container')

export const resizer = document.getElementById('resizer');

export const leftPanel = document.getElementById('graph-container');

export const rightPanel = document.getElementById('right-panel');

// Get the header elements
export const terminalHeader = document.getElementById('terminal-header');
export const chatboxHeader = document.getElementById('chatbox-header');
export const editorHeader = document.getElementById('editor-header');

// Get the content elements
export const terminalContent = document.getElementById('panel-section terminal');
export const chatboxContent = document.getElementById('chatbox-container');
export const editorContent = document.querySelector('.editor');

export const editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
  mode: "javascript",
  lineNumbers: true,
  foldGutter: true,
  gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
  autoCloseBrackets: true,
  matchBrackets: true,
  theme: "default"
});

function stopNavigateSequences() {
    clearTimeout(navigateSequencesTimeout);
}

let navigateSequencesTimeout = null;


async function navigateSequences(sequences, currentSequenceIndex = 0, currentNodeIndex = 0) {
    for (let i = currentSequenceIndex; i < sequences.length; i++) {
        const sequence = sequences[i];
        let startIndex = 0;
        if (i === currentSequenceIndex) {
            startIndex = currentNodeIndex;
        }
        for (let j = startIndex; j < sequence.length; j++) {
            if (!isPastelBackground) {
                break;
            }
            const nodeId = sequence[j];
            const node = Graph.graphData().nodes.find(n => n.id === nodeId);
            if (node) {
                moveCameraToNode(node);
                await new Promise(resolve => setTimeout(resolve, 2500)); // 2-second delay
            }
        }
    }
}


export async function toggleCameraAutoNav() {
    isPastelBackground = !isPastelBackground;
    if (isPastelBackground) {

        // Call the computeSequences function when the pastel background is toggled on
        const sequences = computeSequences(Graph.graphData().nodes, Graph.graphData().links);

        // console.log(sequences); // Log sequences to see the output
        navigateSequences(sequences);
    } else {
        // Stop the cinematic navigation sequence
        stopNavigateSequences();
    }
}

export async function moveCameraToNode(node) {
    allowOrbit(false);
    const distance = 200;
    const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
    const newPos = node.x || node.y || node.z ? { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio } : { x: 0, y: 0, z: distance };
    Graph.cameraPosition(newPos, node, 1400);
    // setTimeout(() => {
    //   Graph.zoomToFit(10000, 40);  // Adjust duration and padding as needed
    // }, 1400);
}

