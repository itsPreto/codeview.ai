// graph.js: Contains functions related to initializing and updating the graph.

import { allowOrbit, getOrbitAllowed } from '../../utils.js';

console.log("Using function from utils.js", getOrbitAllowed());

export const elem = document.getElementById('3d-graph');

export var Graph = ForceGraph3D({ controlType: 'orbit' })(elem)

export const chatbox = document.getElementById('messages')

export const terminalOutput = document.getElementById('terminal-output');

export const graphContainer = document.getElementById('graph-container');

export const searchResults = document.getElementById('search-results');

export const graphName = document.getElementById('graph-name');

export const topButton = document.getElementById('navUp-bttn');

export const saveButton = document.getElementById('save-button');
  
export const searchBar = document.getElementById('search-bar');
  
export const fullscreenButton = document.getElementById('fullscreen-bttn');
  
export const sendButton = document.getElementById('send-button');

export const chatboxContainer = document.getElementById('chatbox-container');

export const searchContainer = document.getElementById('search-container');

export const messages = document.getElementById('messages')
  
export const userInputField = document.getElementById('user-input');

export const settingsIcon = document.getElementById('settings-icon');

export const container = document.getElementById('container')

export const resizer = document.getElementById('resizer');

export const leftPanel = document.getElementById('graph-container');

export const rightPanel = document.getElementById('right-panel');

// Get the header elements
export const terminalHeader = document.getElementById('terminal-header');
export const chatboxHeader = document.getElementById('chatbox-header');
export const editorHeader = document.getElementById('editor-header');

// Get the content elements
export const terminalContent = document.getElementById('terminal');
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
export async function clusterIsolatedNodes() {
    const graphData = Graph.graphData();
    const linkedNodes = new Set();
    graphData.links.forEach(link => {
        linkedNodes.add(link.source);
        linkedNodes.add(link.target);
    });

    const isolatedNodes = graphData.nodes.filter(node => !linkedNodes.has(node.id));

    if (isolatedNodes.length > 0) {
        // Step 2: Group the isolated nodes by package
        const packageGroups = {};
        isolatedNodes.forEach(node => {
            if (!packageGroups[node.id]) {
                packageGroups[node.id] = [];
            }
            packageGroups[node.id].push(node);
        });

        // Step 3: Cluster the nodes within each package group
        Object.values(packageGroups).forEach((group, index) => {
            // Creating multiple layers of circles for a more spherical look
            const layers = Math.ceil(Math.sqrt(group.length)); // Calculate how many layers are needed
            const nodesPerLayer = Math.ceil(group.length / layers);
            const layerRadiusIncrement = 10; // Increase each layer's radius

            group.forEach((node, idx) => {
                const layerIndex = Math.floor(idx / nodesPerLayer);
                const angleStep = (5 * Math.PI) / nodesPerLayer;
                const radius = 20 + layerIndex * layerRadiusIncrement; // Each layer is further out

                node.fx = radius * Math.cos(idx * angleStep);
                node.fy = radius * Math.sin(idx * angleStep);
                node.fz = layerIndex * 15; // This spreads nodes out along the z-axis
            });
        });

        // Step 4: Apply forces between package groups
        const packageForce = d3.forceManyBody()
            .filter(node => isolatedNodes.includes(node));

        Graph.d3Force('packageForce', packageForce);

        // Step 5: Update the graph with the new positions and forces
        Graph.refresh();
    }
}

export async function applyPackageForce(alpha) {
    // Constants for force strengths, these can be adjusted
    const attractionStrength = -1400; // Negative for attraction
    const repulsionStrength = 2800;   // Positive for repulsion

    // Your graph's nodes
    const nodes = Graph.graphData().nodes;

    for (let i = 0; i < nodes.length; ++i) {
        for (let j = i + 1; j < nodes.length; ++j) {
            const nodeA = nodes[i];
            const nodeB = nodes[j];

            // Calculate the distance between nodes in 3D space
            const dx = nodeB.x - nodeA.x;
            const dy = nodeB.y - nodeA.y;
            const dz = nodeB.z - nodeA.z; // Include the z-dimension
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; // Avoid division by zero

            // Choose the force based on whether nodes are in the same package
            const samePackage = nodeA.package === nodeB.package;
            const forceStrength = samePackage ? repulsionStrength : attractionStrength;
            const force = (forceStrength * alpha) / dist;

            // Apply the force in three dimensions
            const forceX = (force * dx) / dist;
            const forceY = (force * dy) / dist;
            const forceZ = (force * dz) / dist; // Force in the z-dimension

            nodeA.vx -= forceX;
            nodeA.vy -= forceY;
            nodeA.vz -= forceZ; // Apply force to z velocity
            nodeB.vx += forceX;
            nodeB.vy += forceY;
            nodeB.vz += forceZ; // Apply force to z velocity
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

