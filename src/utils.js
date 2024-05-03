// apis.js: has all the API calls

export let rollingContext = [];

const MAX_CONTEXT_LENGTH = 4000;
// Maximum characters to retain in the chat context

let isResizing = false;

export function setResizing(value) {
    isResizing = value;
}

export function getResizing() {
    return isResizing;
}
  
let isOrbitAllowed = true; // Changed to let for internal mutability

export function allowOrbit(value) {
  isOrbitAllowed = value;
}

export function getOrbitAllowed() {
  return isOrbitAllowed;
}

let isLlamaRunning = true; // Changed to let for internal mutability

export function allowLlamaRun(value) {
    isLlamaRunning = value;
}

export function getLlamaRunning() {
  return isLlamaRunning;
}


// Define a D3 sequential color scale
const colorScale = d3.scaleSequential()
    .domain([0, 1])
    .interpolator(d3.interpolateSpectral);

const linksColorScale = d3.scaleSequential()
    .domain([0, 1])
    .interpolator(d3.interpolateTurbo);

// Easing functions
export function easeOutCubic(t) {
    return (--t) * t * t + 1;
}

export function easeInCubic(t) {
    return t * t * t;
}


export function computeSequences(nodes, links) {

    const adjacencyList = new Map();
    const visited = new Set();
    const sequences = [];

    // Create adjacency list
    links.forEach(link => {
        if (!adjacencyList.has(link.source)) {
            adjacencyList.set(link.source, []);
        }
        if (!adjacencyList.has(link.target)) {
            adjacencyList.set(link.target, []);
        }
        adjacencyList.get(link.source).push(link.target);
        adjacencyList.get(link.target).push(link.source);
    });

    function dfs(node, sequence) {
        visited.add(node);
        sequence.push(node);
        const neighbors = adjacencyList.get(node) || [];

        neighbors.forEach(neighbor => {
            if (!visited.has(neighbor)) {
                dfs(neighbor, sequence);
            }
        });
    }

    // Iterate over all nodes and run DFS to find sequences
    nodes.forEach(node => {
        if (!visited.has(node.id)) {
            const sequence = [];
            dfs(node.id, sequence);
            sequences.push(sequence);
        }
    });

    // Sort sequences by length (longest first) and return
    return sequences.sort((a, b) => b.length - a.length);
}

// Function to reverse link directions
function reverseLinkDirections(links) {
    links.forEach(link => {
        // Swap source and target
        const temp = link.source;
        link.source = link.target;
        link.target = temp;
    });
}

export function linkCounts(nodes, links) {
    // Initialize an object to store the link count for each node
    const linkCount = {};
    nodes.forEach(node => {
        linkCount[node.id] = 0;  // Initialize each node's link count to 0
    });

    // Iterate over each link to count connections for source and target nodes
    links.forEach(link => {
        if (link.source in linkCount) {
            linkCount[link.source]++;
        }
        if (link.target in linkCount) {
            linkCount[link.target]++;
        }
    });

    // Return the object containing link counts for each node
    return linkCount;
}

// Helper function to get trimmed Id
export function getTrimmedId(fullPath) {

    const MAX_LENGTH = 50;

    if (fullPath.length > MAX_LENGTH) {
        const parts = fullPath.split('/');
        const lastPart = parts.pop();
        const secondLastPart = parts.pop();

        return `.../${secondLastPart}/${lastPart}`;

    } else {
        return fullPath;
    }

}

// Helper function to convert a word to a basic phonetic representation
export function phoneticEncode(word) {
    return word.toLowerCase()
        .replace(/b/g, 'p')
        .replace(/v/g, 'f')
        .replace(/d/g, 't')
        .replace(/g/g, 'k')
        .replace(/z/g, 's')
        .replace(/[aeiou]/g, '')  // Remove vowels
        .replace(/c/g, 'k')
        .replace(/q/g, 'k')
        .replace(/x/g, 'ks')
        .replace(/m/g, 'n')
        .replace(/l/g, 'r');
}

export function createNestedHTMLFromMarkdown(markdownContent) {
    // Define the section class
    class Section {
        constructor(header) {
            this.header = header;
            this.content = '';
            this.subsections = [];
        }

        toHTML() {
            // Convert section to HTML
            let html = `<details><summary>${this.header}</summary>${this.content}`;

            // Convert subsections to HTML and add them to the current section
            if (this.subsections.length > 0) {
                html += this.subsections.map(subsection => subsection.toHTML()).join('');
            }

            html += '</details>';
            return html;
        }
    }

    // Helper function to determine the header level
    function getHeaderLevel(header) {
        let level = 0;
        while (header[level] === '#') {
            level++;
        }
        return level;
    }

    // Split the content into lines and initialize variables
    const lines = markdownContent.split('\n');
    const root = new Section('Root');  // Root section to hold everything
    let currentSection = root;  // The current section we are filling
    let currentLevel = 0;  // The current header level we are at

    lines.forEach(line => {
        const trimmedLine = line.trim();

        // The line is content. Check if it's not just an empty string or whitespace.
        if (trimmedLine.length > 1) {  // Check if the line has actual content
            // It's actual content; wrap it in <p> tags
            currentSection.content += `<p>${line}</p>\n`;  // Note: Using template literals for clarity
        } // If it's an empty string or just whitespace, we do nothing (no else block needed)

        if (trimmedLine.startsWith('#')) {
            // The line is a header
            const level = getHeaderLevel(trimmedLine);

            // Create a new section for the header
            const headerText = trimmedLine.slice(level).trim();  // Remove '#' characters
            const newSection = new Section(headerText);

            if (level > currentLevel) {
                // The new section is a subsection of the current section
                currentSection.subsections.push(newSection);
            } else {
                // The new section is a sibling of the current section's parent
                // We need to go up the right number of levels in the hierarchy
                let parentSection = currentSection;
                for (let i = 0; i <= currentLevel - level; i++) {
                    parentSection = parentSection.subsections.length ? parentSection.subsections[0] : root;
                }
                parentSection.subsections.push(newSection);
            }

            // Update the current section and level
            currentSection = newSection;
            currentLevel = level;
        }
    });

    // Convert the root section to HTML
    // The root section itself is not converted to a <details> element, only its subsections
    return root.subsections.map(section => section.toHTML()).join('');
}

export function getFullHeight(element) {
    const prevHeight = element.style.height;

    // Temporarily disable the transition, set height auto, and calculate the full height
    element.style.transition = 'none';
    element.style.height = 'auto';
    const fullHeight = window.getComputedStyle(element).height;

    // Revert the height and re-enable the transition
    element.style.height = prevHeight;
    element.offsetHeight; // Trigger reflow to ensure the next style change starts a new transition
    element.style.transition = '';

    return fullHeight;
}

export function reverseFlowAndColorize(data) {

    reverseLinkDirections(data.links);

    const nodesToAdd = [...data.nodes];
    const linksToAdd = [...data.links];

    // Map node data to colors
    nodesToAdd.forEach((node, i) => {
        node.color = colorScale(i / nodesToAdd.length);
    });

    linksToAdd.forEach((link, i) => {
        link.color = linksColorScale(i / linksToAdd.length);
    });

    return { nodes: nodesToAdd, links: linksToAdd };
}

// Function to update chat context with new messages
export function updateChatContext(newMessage) {
    // Add the new message to the chat context
    rollingContext.push(newMessage);

    // Calculate the total number of characters in the chat context
    let charCount = rollingContext.reduce((count, message) => count + message.length, 0);

    // If the character count exceeds the limit, remove the oldest messages
    while (charCount > MAX_CONTEXT_LENGTH) {
        const removedMessage = rollingContext.shift();  // Remove the oldest message
        charCount -= removedMessage.length;  // Update the character count
    }

    return rollingContext;

}

function getContrastYIQ(hexcolor) {
    // If the hex color is shorthand, expand it to full length
    if (hexcolor.length === 4) {
        hexcolor = '#' + [hexcolor[1], hexcolor[1], hexcolor[2], hexcolor[2], hexcolor[3], hexcolor[3]].join('');
    }

    // Convert hex color values to decimal
    var r = parseInt(hexcolor.substr(1, 2), 16);
    var g = parseInt(hexcolor.substr(3, 2), 16);
    var b = parseInt(hexcolor.substr(5, 2), 16);
    var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? 'black' : '#ffffffcc'; // choosing black or white depending on the color
}

// Function to compute the similarity between two phonetic codes
export function phoneticSimilarity(code1, code2) {
    let shorter = code1.length < code2.length ? code1 : code2;
    let longer = code1.length >= code2.length ? code1 : code2;
    let score = 0;

    for (let i = 0; i < shorter.length; i++) {
        if (shorter[i] === longer[i]) {
            score++;
        }
    }

    return score / longer.length;  // Return the percentage of similarity
}
