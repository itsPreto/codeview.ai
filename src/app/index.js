// index.js: the main file for the application

import {
  Graph, elem, graphName, topButton, graphContainer, codeEditor,
  saveButton, searchBar, fullscreenButton, settingsIcon, sendButton, chatboxContainer, searchContainer, messages,
  localPathBtn, cloneRepoBtn, repoUrlsInput, localPathInput, container, resizer, leftPanel, overlay, userInputField,
  inputForm, percentComplete, loadingSpinner, rightPanel, moveCameraToNode, searchResults, editor, editorContent
} from '../components/graph/graph.js';
import {
  appState, cmdLineApi, updateTerminalOutput, sendUserInputToApi, loadFileTrees, fetchFileContent,
} from '../components/api/api.js';
import { allowOrbit, getOrbitAllowed, getResizing, linkCounts, setResizing, reverseFlowAndColorize } from '../utils.js'
import { fetchFileSummary } from '../components/llama/llama.js';

// Define graph levels as constants for better control
const GRAPH_LEVELS = {
  INSANITY: 'INSANITY-LEVEL',
  MODULES: 'MODULES-LEVEL',
  FILES: 'FILES-LEVEL'
};

let shiftKeyPressed = false;
let currentLevel = GRAPH_LEVELS.MODULES;
let currBillboard = null;

// Current level state

// Start loading data/jsons
loadFileTrees()

function updateGraphName(level, nodeId) {
  console.log(`level: ${level}`)
  if (level === GRAPH_LEVELS.FILES) {
    graphName.textContent = `currently on: ${nodeId}`
    Graph.enableNodeDrag(false);
  } else if (level === GRAPH_LEVELS.MODULES) {
    graphName.textContent = `currently on: modules`
  } else if (level === GRAPH_LEVELS.INSANITY) {
    graphName.textContent = `currently on: all`
    Graph.enableNodeDrag(false);
  }
}

// Commonly used constants and utilities
const cameraTransitionDuration = 1900;
const cameraDistance = 40;


function formatNodeLabel(node) {
  const MAX_DISPLAY_LENGTH = 50;
  const fullPath = node.id;
  if (fullPath.length > MAX_DISPLAY_LENGTH) {
    const pathParts = fullPath.split('/');
    const lastPart = pathParts.pop();
    const secondLastPart = pathParts.pop();
    return `<div><span class='label'>Name: .../${secondLastPart}/${lastPart}</span></div>`;
  }
  return `<div><span class='label'>Name: ${fullPath}</span></div>`;
}

function calculateNodeSize(node, minSize, maxSize) {
  const sizeRange = maxSize - minSize;
  const { fileSize, nodes } = Graph.graphData();
  let minFile = Infinity, maxFile = -Infinity;
  nodes.forEach(n => {
    if (n.fileSize < minFile) minFile = n.fileSize;
    if (n.fileSize > maxFile) maxFile = n.fileSize;
  });
  if (minFile !== maxFile) {
    const normalizedSize = (node.fileSize - minFile) / (maxFile - minFile);
    return normalizedSize * sizeRange + minSize;
  }
  return 5; // Default size if all files are the same size
}

function updateCameraPosition(node, distRatio) {
  const newPos = node.x || node.y || node.z
    ? { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }
    : { x: 0, y: 0, z: cameraDistance }; // special case if node is at origin
  Graph.cameraPosition(newPos, node, cameraTransitionDuration);
}

function setupForceLayout() {
  const nodes = Graph.graphData().nodes;
  const links = Graph.graphData().links;

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(100).strength(1))
    .force("charge", d3.forceManyBody().strength(-400))
    .force("center", d3.forceCenter(Graph.width() / 2, Graph.height() / 2))
    .force("x", d3.forceX(Graph.width() / 2).strength(0.1))
    .force("y", d3.forceY(Graph.height() / 2).strength(0.1));

  simulation.on("tick", () => {
    // Update node positions on tick
    Graph.nodeThreeObject(node => nodeObjectWithLabel(node));
    Graph.refresh();
  });

  // Stop the simulation after initial layout
  simulation.stop();
}

Graph.onEngineTick(() => setupForceLayout());


function nodeObjectWithLabel(node) {
  const group = new THREE.Group();
  const nodeSize = calculateNodeSize(node, 10, 40);
  const geometry = new THREE.SphereGeometry(nodeSize, 32, 32);
  const material = new THREE.MeshBasicMaterial({ color: node.color });
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  const label = new SpriteText(node.id.split('/').pop());
  label.material.depthWrite = false;
  label.color = "#ffffffff";
  label.textHeight = 14;
  label.position.y = nodeSize + 40;
  group.add(label);

  const lineMaterial = new THREE.LineDashedMaterial({ color: node.color, dashSize: 3.5, gapSize: 0.5 });
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, nodeSize, 0)
  ]);
  const line = new THREE.Line(lineGeometry, lineMaterial);
  line.computeLineDistances();
  group.add(line);

  return group;
}

// Initialize graph with provided data and level specifics
// In the initializeGraph function, add a setup for the repository filter
async function initializeGraph(graphData, level, nodeId) {
  currentLevel = level;
  updateGraphName(level, nodeId);
  Graph.graphData(graphData)
    .height(window.innerHeight)
    .linkWidth(3)
    .onBackgroundRightClick(() => allowOrbit(!getOrbitAllowed()))
    .nodeLabel(formatNodeLabel)
    .linkCurvature(0.6)
    .linkDirectionalParticles(1)
    .cameraPosition({ z: 4400 })
    .onNodeHover(handleNodeHover)
    .backgroundColor('#00000000')
    .width(window.innerWidth / 2 + 100)
    .linkDirectionalParticleColor(node => node.color)
    .d3Force('packageForce', applyPackageForce)
    .linkDirectionalParticleWidth(1)
    .linkDirectionalParticleSpeed(0.0023)
    .onNodeClick(handleNodeClick)
    .nodeThreeObject(nodeObjectWithLabel);

  // if (level === GRAPH_LEVELS.INSANITY) {
  //   setupRepositoryFilters(graphData); // Call to setup filters
  // }

  await clusterIsolatedNodes(); // Ensure isolated nodes are clustered on initialization
  setupCameraOrbit();
  Graph.refresh();

  // Adjust top button for navigation
  updateTopButton();
}

// Function to extract repository name from the file path
function extractRepoName(filePath) {
  const repoMatch = /\/repos\/([^\/]+)/.exec(filePath);
  return repoMatch ? repoMatch[1] : 'Unknown';
}

// Adjusted function to setup repository filters
function setupRepositoryFilters(graphData) {
  const filterContainer = document.createElement('div');
  filterContainer.id = 'repo-filter-container';
  filterContainer.style.position = 'absolute';
  filterContainer.style.left = '10px';
  filterContainer.style.top = '10px';
  filterContainer.style.display = 'flex';
  filterContainer.style.flexDirection = 'column';
  graphContainer.appendChild(filterContainer);

  const repos = new Set();
  graphData.nodes.forEach(node => repos.add(extractRepoName(node.id)));

  repos.forEach(repo => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.id = repo;
    checkbox.onchange = () => toggleRepoVisibility(repo, checkbox.checked);

    const label = document.createElement('label');
    label.htmlFor = repo;
    label.textContent = repo;

    filterContainer.appendChild(checkbox);
    filterContainer.appendChild(label);
  });
}

// Function to toggle visibility based on repository
function toggleRepoVisibility(repo, isVisible) {
  Graph.graphData().nodes.forEach(node => {
    if (extractRepoName(node.id) === repo) {
      node.hidden = !isVisible; // You may need to adjust how you handle visibility
    }
  });
  Graph.graphData().links.forEach(link => {
    if (extractRepoName(link.source) === repo || extractRepoName(link.target) === repo) {
      link.hidden = !isVisible; // You may need to adjust how you handle visibility
    }
  });
  Graph.refresh();
}


// Fetch data for graphs based on level and initialize the graph
// Function to fetch graph data and initialize graph at a specific node level
async function fetchAndInitializeGraph(level, nodeId = null) {
  let filePath;
  let basePath = "../../assets/";
  switch (level) {
    case GRAPH_LEVELS.INSANITY:
      filePath = 'full_graph.json';
      break;
    case GRAPH_LEVELS.MODULES:
      filePath = 'repos_graph.json';
      break;
    case GRAPH_LEVELS.FILES:
      filePath = `files/${nodeId}.json`;
      break;
  }
  await fetchJson(basePath + filePath, level, nodeId);
}

async function fetchJson(filePath, level, nodeId) {
  try {
    const response = await fetch(filePath);
    const graphData = await response.json();
    // Reverse the link directions right after fetching the data.
    reverseFlowAndColorize(graphData);
    initializeGraph(graphData, level, nodeId);
  } catch (error) {
    console.error("Error fetching graph data:", error);
  }
}

// Update the top button to reflect possible actions based on current level
function updateTopButton() {
  if (currentLevel === GRAPH_LEVELS.MODULES) {
    topButton.textContent = 'full';
    topButton.onclick = () => fetchAndInitializeGraph(GRAPH_LEVELS.INSANITY);
  } else if (currentLevel === GRAPH_LEVELS.INSANITY) {
    topButton.textContent = 'modules';
    topButton.onclick = () => fetchAndInitializeGraph(GRAPH_LEVELS.MODULES);
  } else if (currentLevel === GRAPH_LEVELS.FILES) {
    topButton.textContent = 'modules';
    topButton.onclick = () => fetchAndInitializeGraph(GRAPH_LEVELS.MODULES);
  }
}

export async function clusterIsolatedNodes() {
  const graphData = Graph.graphData();
  const linkedNodes = new Set();
  graphData.links.forEach(link => {
    linkedNodes.add(link.source);
    linkedNodes.add(link.target);
  });

  const totalElements = graphData.nodes.length + graphData.links.length;
  const radiusBase = 200; // Base radius for small graphs
  const radiusMultiplier = Math.max(1, Math.floor(totalElements / 1000)); // Increase radius based on size

  // Identify isolated nodes
  const isolatedNodes = graphData.nodes.filter(node => !linkedNodes.has(node.id));

  if (isolatedNodes.length > 0) {
    // Group the isolated nodes by 'user'
    const userGroups = {};
    isolatedNodes.forEach(node => {
      const userKey = node.user || 'unknown';
      userGroups[userKey] = userGroups[userKey] || [];
      userGroups[userKey].push(node);
    });

    // Cluster the nodes within each user group
    Object.values(userGroups).forEach((group, index) => {
      const radius = radiusBase * radiusMultiplier * (index + 1);
      const angleStep = (2 * Math.PI) / group.length;

      group.forEach((node, idx) => {
        node.fx = radius * Math.cos(idx * angleStep);
        node.fy = radius * Math.sin(idx * angleStep);
        node.fz = index * 300; // Stagger groups along z-axis to reduce visual clutter
      });
    });

    Graph.refresh();
  }
}


export async function applyPackageForce(alpha) {
  const graphData = Graph.graphData();
  const totalElements = graphData.nodes.length + graphData.links.length;
  const sizeFactor = Math.max(1, Math.floor(totalElements / 100));

  // Dynamically adjust strengths based on graph size
  const attractionStrength = -284;
  const repulsionStrength = 17790;

  const nodes = graphData.nodes;

  for (let i = 0; i < nodes.length; ++i) {
    for (let j = i + 1; j < nodes.length; ++j) {
      const nodeA = nodes[i];
      const nodeB = nodes[j];

      const dx = nodeB.x - nodeA.x;
      const dy = nodeB.y - nodeA.y;
      const dz = nodeB.z - nodeA.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

      const samePackage = nodeA.user === nodeB.user;
      const forceStrength = samePackage ? repulsionStrength : attractionStrength;
      const force = (forceStrength * alpha) / dist;

      const forceX = (force * dx) / dist;
      const forceY = (force * dy) / dist;
      const forceZ = (force * dz) / dist;

      nodeA.vx -= forceX;
      nodeA.vy -= forceY;
      nodeA.vz -= forceZ;
      nodeB.vx += forceX;
      nodeB.vy += forceY;
      nodeB.vz += forceZ;
    }
  }
}


// Function to handle node hover
async function handleNodeHover(node) {
  if (!node) return;
  if (shiftKeyPressed) {
    try {
      const fileContent = await fetchFileContent(node.id);
      let constrainedWidth = ((container.style.width - graphContainer.style.width) - 50) + 'px';
      editorContent.style.width = constrainedWidth
      editor.setValue(fileContent);
      fetchFileSummary(node.id);
    } catch (error) {
      console.error('Error fetching file content:', error);
    }
  }
}
async function handleNodeClick(node) {
  const distRatio = 1 + cameraDistance / Math.hypot(node.x, node.y, node.z);
  updateCameraPosition(node, distRatio);
  await new Promise(resolve => setTimeout(resolve, cameraTransitionDuration));

  if (currentLevel === GRAPH_LEVELS.MODULES) {
    // Load the files-level graph for the clicked module
    fetchAndInitializeGraph(GRAPH_LEVELS.FILES, node.id);
  } else if (currentLevel === GRAPH_LEVELS.FILES) {
    // Potentially handle clicks within a file-level graph if needed
    console.log('File node clicked:', node.id);
    // Additional behavior can be added here if nodes within FILES-LEVEL should be interactive
  }
}



// Camera orbit functionality setup
function setupCameraOrbit() {
  const initialCameraPosition = Graph.cameraPosition();
  let initialRadius = Math.sqrt(
    initialCameraPosition.x * initialCameraPosition.x +
    initialCameraPosition.y * initialCameraPosition.y +
    initialCameraPosition.z * initialCameraPosition.z
  );
  let angle = 0;
  setInterval(() => {
    if (getOrbitAllowed()) {
      const currentCameraPosition = Graph.cameraPosition();
      const currentRadius = Math.sqrt(
        currentCameraPosition.x * currentCameraPosition.x +
        currentCameraPosition.y * currentCameraPosition.y +
        currentCameraPosition.z * currentCameraPosition.z
      );
      const radius = Math.abs(currentRadius - initialRadius) > 10 ? currentRadius : initialRadius;
      angle += Math.PI / 150;
      Graph.cameraPosition({
        x: radius * Math.sin(angle),
        y: currentCameraPosition.y,
        z: radius * Math.cos(angle)
      });
    }
  }, 20);
}

function stopResize(e) {
  setResizing(false);
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', stopResize);
  // resizer.style.background = '#333'
}

function populateSearchResults(query) {
  const matchingNodes = Graph.graphData().nodes.filter(node => node.id.toLowerCase().includes(query.toLowerCase()));
  searchResults.innerHTML = '';
  if (matchingNodes.length > 0) {
    searchResults.parentElement.style.display = 'block';
  }
  matchingNodes.forEach(node => {
    const li = document.createElement('li');
    const fileName = node.id.split('/').pop(); // extract the file name from the node's id
    li.textContent = fileName;
    li.addEventListener('click', () => {
      searchBar.value = fileName; // set the search bar value to the file name
      searchResults.innerHTML = '';
      moveCameraToNode(node);
    });
    searchResults.appendChild(li);
  });
}

var overLayWidth = window.innerWidth * 0.32;

function handleMouseMove(e) {
  if (!getResizing()) return;

  let offset = e.clientX - container.getBoundingClientRect().left;
  let containerWidth = container.clientWidth;
  let minGraphWidth = window.innerWidth * 0.32;

  // Ensure graph minimum width is not breached
  if (offset < minGraphWidth) offset = minGraphWidth;
  if (offset > containerWidth - 50) return; // Maintaining a minimum right panel width

  leftPanel.style.width = `${offset}px`;
  Graph.width(offset);
  overlay.style.width = `${offset}px`;
  rightPanel.style.width = `${containerWidth - offset}px`;
  editorContent.style.width = `${containerWidth - offset - 30}px`;
 // Update graphName position
 adjustGraphNamePosition(offset, minGraphWidth, containerWidth);
}

function adjustGraphNamePosition(currentWidth, minWidth, totalWidth) {

  if (currentWidth <= minWidth + 80) {
      graphName.style.left = '27%';
  } 
  else if (currentWidth <= minWidth * 1.6) {
    graphName.style.left = '39%'; 
  }
}

function createFPSCounter() {
  const counter = document.createElement('div');
  counter.style.position = 'absolute';
  counter.style.bottom = '25px';
  counter.style.right = '20px';
  counter.style.color = 'white';
  counter.style.fontSize = '16px';
  counter.style.zIndex = 2;
  graphContainer.appendChild(counter);

  let frameCount = 0;
  let lastUpdate = performance.now();
  let fps = 0;

  function updateCounter() {
    frameCount++;
    const now = performance.now();
    const delta = now - lastUpdate;

    if (delta >= 1000) {
      fps = frameCount / delta * 1000;
      frameCount = 0;
      lastUpdate = now;
      counter.textContent = `${Math.round(fps)} FPS`;
    }

    requestAnimationFrame(updateCounter);
  }

  updateCounter();
}


function toggleFullScreen() {
  if (!document.fullscreenElement) {
    chatboxContainer.style.display = "none";
    topButton.style.display = "none";
    // searchContainer.style.display = "none";
    graphContainer.requestFullscreen();
    elem.style.width = screen.width + 'px';
    elem.style.height = screen.height + 'px';

    // Update graph dimensions
    Graph.width(screen.width);
    Graph.height(screen.height);
  } else {
    if (document.exitFullscreen) {
      // Remove event listener before exiting fullscreen
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.exitFullscreen();
    }
  }
}


function toggleOverlay() {
  // elem.style.visibility = 'hidden';
  overlay.style.bottom = 0;
}


// Function to handle fullscreen change
function handleFullscreenChange() {
  if (!document.fullscreenElement) {
    chatboxContainer.style.display = "block";
    topButton.style.display = "block";
    // searchContainer.style.display = "block";
    elem.style.width = '100%';
    elem.style.height = '100%';

    // Update graph dimensions
    Graph.width(window.innerWidth / 2);
    Graph.height(window.innerHeight);
  }
}


let percent = 0;
let interval;


function toggleProcessing(start) {
  ;
  loadingSpinner.hidden = !start;
  userInputField.hidden = start;

  if (start) {
    percent = 0;
    interval = setInterval(() => {
      if (percent < 90) {
        percent += 1;
        percentComplete.textContent = percent + '%';
      }
    }, 2000);
  } else {
    clearInterval(interval);
  }
}

function hideOverlay() {
  // elem.style.visibility = "visible";
  overlay.style.bottom = '-100%'; // Move overlay out of view
}

function handleResponse(response) {
  if (response.ok) {
    response.json().then(data => {
      console.log(data);
      alert('Processing completed successfully.');
      finishLoading();
    });
  } else {
    throw new Error('Failed to process.');
  }
}

function handleError(error) {
  console.error('Error:', error);
  alert('Failed to process.');
  finishLoading();
}

function finishLoading() {
  clearInterval(interval);
  percentComplete.textContent = '100%';
  setTimeout(() => {
    loadingSpinner.hidden = true;
    inputForm.hidden = false;
    percent = 0;
    percentComplete.textContent = '0%';
    hideOverlay(); // Hide the overlay after processing is complete
  }, 500);
}

export async function processLocalPath() {
  toggleProcessing(true);
  const localPath = document.getElementById('local-path-input').value;

  try {
    const response = await fetch('http://127.0.0.1:8000/process/local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: localPath })
    });

    handleResponse(response);
  } catch (error) {
    handleError(error);
  }
}

export async function cloneAndProcessRepos() {
  toggleProcessing(true);
  const repoUrls = document.getElementById('repo-urls-input').value.split('\n');

  try {
    const response = await fetch('http://127.0.0.1:8000/clone_and_process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_urls: repoUrls })
    });

    handleResponse(response);
  } catch (error) {
    handleError(error);
  }
}

// LISTENERS

document.addEventListener('DOMContentLoaded', function () {

  fetchAndInitializeGraph(GRAPH_LEVELS.MODULES);

  overlay.style.width = elem.style.width;
  codeEditor.style.width = `${rightPanel.style.width - 100}px`;

  settingsIcon.addEventListener('click', toggleOverlay);

  const buttons = document.querySelectorAll('.toggle-size');
  buttons.forEach(button => {
    button.addEventListener('click', function() {
      const target = this.getAttribute('data-target');
      const targetDiv = document.querySelector(`.${target}`);
      const isMaximized = targetDiv.classList.contains('maximized');

      document.querySelectorAll('.panel-section').forEach(div => {
        if (div !== targetDiv) {
          div.classList.remove('maximized');
          div.style.transition = "all 0.5s ease-in-out";
          div.style.flex = '1';
        }
      });

      if (isMaximized) {
        targetDiv.classList.remove('maximized');
        targetDiv.style.transition = "all 0.5s ease-in-out";
        targetDiv.style.flex = '1';
      } else {
        targetDiv.classList.add('maximized');
        targetDiv.style.transition = "all 0.5s ease-in-out";
        targetDiv.style.flex = '10';
      }
    });
  });

  fullscreenButton.addEventListener('click', toggleFullScreen);

  // Event listener for top button
  topButton.addEventListener('click', () => {
    if (currentLevel === GRAPH_LEVELS.MODULES) {
      fetchAndInitializeGraph(GRAPH_LEVELS.INSANITY);
    } else {
      fetchAndInitializeGraph(GRAPH_LEVELS.MODULES);
    }
  });

  cloneRepoBtn.addEventListener('click', () => {
    if (repoUrlsInput.value) {
      cloneAndProcessRepos();
    } else {
      alert('Please enter a list of repository URLs');
    }
  });

  localPathBtn.addEventListener('click', () => {
    if (localPathInput.value) {
      processLocalPath();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideOverlay();
    }
  });

  graphContainer.style.width = window.innerWidth / 2;

  // overlay.style.width = window.innerWidth / 2;


  elem.style.overflowY = 'hidden';
  elem.style.overflowX = 'hidden';


  saveButton.addEventListener('click', async () => {
    const updatedContent = editor.getValue();
    const currentNodeId = Graph.getSelectedNode().id;

    try {
      await saveFileChanges(currentNodeId, updatedContent);
      alert('Changes saved successfully');
    } catch (error) {
      console.error('Error saving changes:', error);
      alert('Failed to save changes');
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Shift') {
      shiftKeyPressed = true;
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
      shiftKeyPressed = false;
    }
  });



  document.getElementById('terminal-input').addEventListener('keypress', async function (event) {
    if (event.key === 'Enter') {
      event.preventDefault(); // Prevent default to stop from any form submission
      const command = this.value;
      this.value = ''; // Clear the input after sending the command
      // Display command in terminal output as user input
      updateTerminalOutput('> ' + command, null);

      cmdLineApi(command)
        .then(data => {
          // Assuming data contains .output and .errors
          updateTerminalOutput(data.output, data.errors);
        })
        .catch(error => {
          updateTerminalOutput(null, error.message);
        });
    }
  });

  resizer.addEventListener('mousedown', () => {
    setResizing(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
  });


  elem.addEventListener('mousedown', (event) => {
    if (event.buttons === 1) {  // Check if only the primary button is pressed
      allowOrbit(false);
    }
  });

  // Add event listener for fullscreen change
  document.addEventListener('fullscreenchange', handleFullscreenChange);

  createFPSCounter();

  window.addEventListener('resize', () => {
    Graph.width(window.innerWidth / 2);
    Graph.height(window.innerHeight);
  });

  userInputField.addEventListener('keydown', async e => {
    if (e.keyCode === 13 && !e.shiftKey) {
      e.preventDefault();

      // Check that field has value before submitting
      if (userInputField.value.trim() !== '') {
        await sendUserInputToApi();
      }
    }
  });

  document.getElementById('toggleRecording').addEventListener('click', toggleRecording);



  sendButton.addEventListener('click', async () => {
    await sendUserInputToApi();
  });


  searchBar.addEventListener('input', () => {
    const query = searchBar.value;

    if (query === '') {
      searchResults.innerHTML = '';
    } else {
      populateSearchResults(query);
    }
  });
});