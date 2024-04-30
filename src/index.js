// index.js: the main file for the application

import { Graph, elem, graphName, topButton, graphContainer,  
    saveButton, searchBar, fullscreenButton, sendButton, chatboxContainer, searchContainer, messages, 
    userInputField, settingsIcon, container, resizer, leftPanel, rightPanel, moveCameraToNode, searchResults, editor
  } from './components/graph/graph.js';
  import { 
    appState, cmdLineApi, sendUserInputToApi, loadFileTrees, fetchRepoDataAsync, fetchFileContent 
  } from './components/api/api.js';
  import { allowOrbit, getOrbitAllowed, getResizing, linkCounts, setResizing } from './utils.js'
  import { fetchFileSummary } from './components/llama/llama.js';
  
  let shiftKeyPressed = false;
  let currBillboard = null;
  
  // Start loading data/jsons
  loadFileTrees().then(() => {
    console.log('Initialization complete. Proceed with application logic.');
    // Initialize the root level graph (contains the module-module deps)
    fetchRepoDataAsync('repos_graph', true).then(graphData => {
      initializeGraph(graphData)
    }).catch(error => {
      console.error("Error fetching data: ", error);
    });
  });
  
  function updateGraphName(name) {
    console.log(`name: ${name}`)
    graphName.textContent = `currently on: ${name}`
  }
  
  function updateTopLevelButton() {
    if (appState.isAtTopLevel) {
      topButton.style.display = 'none';
    } else {
      topButton.style.display = 'inline';
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

export async function initializeGraph(graphData) {
    updateGraphName("root");
    Graph.d3Force('packageForce', applyPackageForce);
    updateTopLevelButton();

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
        .linkDirectionalParticleWidth(1)
        .linkDirectionalParticleSpeed(0.0023)
        .onNodeClick(handleNodeClick)
        .nodeThreeObject(nodeObjectWithLabel);

    await clusterIsolatedNodes(); // Ensure isolated nodes are clustered on initialization
    setupCameraOrbit();
    Graph.refresh();
}


export async function clusterIsolatedNodes() {
    const graphData = Graph.graphData();
    const linkedNodes = new Set();
    graphData.links.forEach(link => {
        linkedNodes.add(link.source);
        linkedNodes.add(link.target);
    });

    // Identify isolated nodes
    const isolatedNodes = graphData.nodes.filter(node => !linkedNodes.has(node.id));

    if (isolatedNodes.length > 0) {
        // Group the isolated nodes by 'user'
        const userGroups = {};
        isolatedNodes.forEach(node => {
            const userKey = node.user || 'unknown'; // Default group for nodes without a 'user'
            userGroups[userKey] = userGroups[userKey] || [];
            userGroups[userKey].push(node);
        });

        // Cluster the nodes within each user group
        Object.values(userGroups).forEach((group, index) => {
            const radius = 300 * (index + 1); // Increasing radius for each group
            const angleStep = (2 * Math.PI) / group.length;

            group.forEach((node, idx) => {
                node.fx = radius * Math.cos(idx * angleStep); // Fixed x position
                node.fy = radius * Math.sin(idx * angleStep); // Fixed y position
                node.fz = index * 100; // Stagger groups along z-axis to reduce visual clutter
            });
        });

        // Apply forces to separate different user groups
        const userGroupForce = d3.forceManyBody()
            .strength(-500)
            .distanceMax(1000)
            .filter(node => isolatedNodes.includes(node));

        Graph.d3Force('userGroupForce', userGroupForce);

        // Refresh the graph with new positions
        Graph.refresh();
    }
}


export async function applyPackageForce(alpha) {
    // Constants for force strengths, these can be adjusted
    const attractionStrength = -284; // Negative for attraction
    const repulsionStrength = 4790;   // Positive for repulsion

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
            const samePackage = nodeA.user === nodeB.user;
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


// Function to handle node hover
async function handleNodeHover(node) {
  if (!node) return;
  if (shiftKeyPressed) {
    try {
      const fileContent = await fetchFileContent(node.id);
      editor.setValue(fileContent);
      fetchFileSummary(node.id);
    } catch (error) {
      console.error('Error fetching file content:', error);
    }
  }
}

// Function to handle node clicks, change graph context or detail view
async function handleNodeClick(node) {
  const distRatio = 1 + cameraDistance / Math.hypot(node.x, node.y, node.z);
  updateCameraPosition(node, distRatio);
  await new Promise(resolve => setTimeout(resolve, cameraTransitionDuration));
  if (appState.isAtTopLevel) {
    appState.isAtTopLevel = false;
    await loadNewGraph(node);
  } else {
    // Handle non-top level node clicks if necessary
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

// Function to load a new graph context when a node is clicked
async function loadNewGraph(node) {
  try {
    const repoGraphData = await fetchRepoDataAsync(node.id);
    updateGraphName(node.id);
    updateTopLevelButton();
    node.description = `${node.description} - Files: ${repoGraphData.nodes.length}`;
    Graph.graphData(repoGraphData);
    Graph.nodeThreeObject(nodeObjectWithLabel);
    appState.isAtTopLevel = false;
    Graph.refresh();
  } catch (error) {
    console.error('Error loading new graph data:', error);
  }
}

  
  function handleMouseMove(e) {
    if (!getResizing()) return;
    // resizer.style.background = '#fa4090'
    let offset = e.clientX - container.getBoundingClientRect().left;
    let containerWidth = container.clientWidth;
    if (offset < 50 || offset > containerWidth - 50) return;  // Minimum width constraint
    leftPanel.style.width = offset + 'px';
    Graph.width(offset);
    rightPanel.style.width = (containerWidth - offset) + 'px';
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
  
  let isPastelBackground = false;
  
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
    var overlay = document.getElementById('overlay');
    overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
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
  
  // LISTENERS
  
  document.addEventListener('DOMContentLoaded', function () {  
    
    settingsIcon.addEventListener('click', toggleOverlay);
    
    // repoUrlsInput.addEventListener('click', cloneAndProcessRepos);
    
    // localPathInput.addEventListener('click', processLocalPath);
    
    fullscreenButton.addEventListener('click', toggleFullScreen);
    
    
    graphContainer.style.width = window.innerWidth / 2;
    
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
    
  
    
    document.getElementById('terminal-input').addEventListener('keypress', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault(); // Prevent default to stop from any form submission
        const command = this.value;
        this.value = ''; // Clear the input after sending the command
    
        // Display command in terminal output
        const output = document.getElementById('terminal-output');
        output.textContent += '\n$ ' + command;
    
        // Send the command to the server
        cmdLineApi(command, output);
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
      // Graph.width(window.innerWidth / 2);
      Graph.height(window.innerHeight);
    });
    
    // overlayContent.addEventListener('click', toggleOverlay);
    
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
    
    topButton.addEventListener('click', async () => {
      appState.isAtTopLevel = true;
    
      // Fetch and load top level data
      const topData = await fetchRepoDataAsync('repos_graph', true);
    
      initializeGraph(topData);
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