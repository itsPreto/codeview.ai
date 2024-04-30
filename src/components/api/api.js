// api.js: Handles API calls and data fetching.

import { reverseFlowAndColorize, updateChatContext, rollingContext, getLlamaRunning, allowLlamaRun } from '../../utils.js';
// console.log("Using function from utils.js", getOrbitAllowed());
import { chatbox, terminalOutput, userInputField, messages } from '../graph/graph.js';
import { llama } from '../llama/llama.js'

export const appState = {
    isAtTopLevel: true,
    reposFileTrees: [],
    fileTrees: [],
    readmeJsons: [],
    readmeData: []
};


export let basePath = "../..";

export function displayResponseInChatbox(responseText, responseElement) {
    // Clear existing content or manage it appropriately
    // Append new response
    responseElement.textContent += responseText;

    // Convert Markdown to HTML (if using Markdown)
    const htmlContent = marked(responseElement.textContent);
    // Sanitize and set HTML content
    responseElement.innerHTML = DOMPurify.sanitize(htmlContent);

    // Scroll to the latest message
    chatbox.scrollTop = chatbox.scrollHeight;
}


export function addUserMessageToChatbox(message) {
    // Assuming user inputs are plain text and do not require Markdown rendering
    // For Markdown, you can use the same approach as in displayResponseInChatbox
    const messageEl = document.createElement('div');
    messageEl.className = 'message message-user';
    messageEl.textContent = message;  // For plain text
    // If Markdown is needed, repeat the marked and DOMPurify steps here
    chatbox.appendChild(messageEl);
    chatbox.scrollTop = chatbox.scrollHeight;
}


async function handleTranscriptWithLLM(transcript) {
    if (true) { // Ensure userInput is defined
        allowLlamaRun(true); // Set the lock
        updateChatContext("User: " + transcript)
        addUserMessageToChatbox(transcript);

        const params = {
            temperature: 0.4,
            n_predict: 20
        }


        const prompt = ` IMPORTANT: Your job is to identify the subject from the users request and reply ONLY with the subject. Here are some examples:
1. User: "Can you update me on the latest build of the WebSerivceGateway?"
Assistant: WebSerivceGateway

2. User: "What are the new features in the latest PatchUpdate tool?"
Assistant: PatchUpdate

3. User: "I need assistance with the InstalationManager malfunctioning."
Assistant: InstalationManager

4. User: "How do I configure the NetworkConfigTool?"
Assistant: NetworkConfigTool

5. User:"Is there a tutorial for the DatabaseMigrator?"
Assistant: DatabaseMigrator

This prompt and these examples should guide the language model to focus on precisely identifying and outputting only the main subject of the query, regardless of any surrounding textual issues.
\n\n Here is the raw user request for you to identify:

User:${transcript}\n
Assistant:`;

        const responseElement = document.createElement('div');
        responseElement.className = 'message message-response';
        messages.appendChild(responseElement);

        let content;

        try {
            for await (const chunk of llama(prompt, params)) {
                content += chunk;
                updateChatContext("Assistant" + chunk)
                displayResponseInChatbox(chunk, responseElement); // Display response in UI
            }

            // Convert the transcription to a phonetic code
            let transcriptionCode = phoneticEncode(content);

            // Find the node with the highest phonetic similarity
            let bestMatch = '';
            let bestScore = 0;

            Graph.graphData().nodes.forEach(node => {
                let nodeCode = phoneticEncode(node.id.split('/').pop());
                let score = phoneticSimilarity(transcriptionCode, nodeCode);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = node;
                    console.log('Best match:', bestMatch, 'with score:', bestScore);
                }
            });
        } catch (error) {
            console.error("Failed to run model:", error);
        } finally {
            allowLlamaRun(false); // Release the lock
        }
    }
}

function updateTerminalOutput(data) {
    terminalOutput.textContent += '\n' + data.output + '\n';
    terminalOutput.scrollTop = terminalOutput.scrollHeight; // Scroll to the bottom
}

export async function loadJsonData(path) {
    try {
        const response = await fetch(path);
        const data = response.json()
        if (!response.ok) {
            throw new Error(`Error loading data from ${path}: ${response.statusText}`);
        }
        return await data;
    } catch (error) {
        console.error(error);
        // Here, you might update the UI to indicate that data couldn't be loaded
        return null; // or an empty array/object, depending on what your app expects
    }
}


export async function saveFileChanges(filePath, updatedContent) {
    try {
        const response = await fetch('http://127.0.0.1:7000/save-file', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filePath, updatedContent }),
        });

        if (!response.ok) {
            throw new Error('Failed to save file changes');
        }
    } catch (error) {
        console.error('Error saving file changes:', error);
        throw error;
    }
}

export async function fetchFileContent(filePath) {
    try {
        const response = await fetch(`http://127.0.0.1:7000/get-file?filePath=${filePath}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch file content for $ ${filePath}`);
        }

        const fileContent = await response.text();

        console.log('File content fetched successfully' + fileContent);
        return fileContent;
    } catch (error) {
        console.error('Error fetching file content:', error);
        throw error;
    }
}

let lastKnownModificationTime = 0;

export async function checkForUpdates(jsonFileName) {
    try {
        const response = await fetch(`http://127.0.0.1:7000/get-last-modified/${jsonFileName}`);
        const data = await response.json();
        if (data.last_modified > lastKnownModificationTime) {
            lastKnownModificationTime = data.last_modified;
            loadAndRefreshGraph(jsonFileName);
        }
    } catch (error) {
        console.error('Failed to fetch update info:', error);
    }
}

function loadAndRefreshGraph(jsonFileName) {
    fetch(`/data/${jsonFileName}`)
        .then(response => response.json())
        .then(graphData => {
            Graph.graphData(graphData);
            Graph.refresh();
        })
        .catch(error => console.error('Failed to load graph data:', error));
}

export function cmdLineApi(command, output) {
    // Trim and replace multiple spaces with a single space
    let formattedCommand = command.trim().replace(/\s+/g, ' ');

    console.log("Formatted Command:", formattedCommand);
    fetch('http://127.0.0.1:7000/execute-command', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command: formattedCommand })
    })
        .then(response => {
            console.log("HTTP Status:", response.status); // Log the HTTP status
            return response.json();
        })
        .then(data => {
            console.log(data);
            updateTerminalOutput(data);
        })
        .catch(error => {
            console.error('Error:', error);
            output.textContent += '\nError: ' + error.message;
        });
}


export function transcribeAudioApi(formData) {
    fetch('http://127.0.0.1:8080/inference', {
        method: 'POST',
        body: formData
    })
        .then(response => response.json())
        .then(data => {
            console.log('Transcription:', data.text);
            const transcript = data.text.split("[BLANK_AUDIO]");

            handleTranscriptWithLLM(transcript);
        })
        .catch(error => {
            console.error('Error sending audio:', error);
            alert('Failed to send audio for transcription.');
        });
}

function getChatContextAsString() {
    // Combine all messages into a single string with a newline delimiter
    return rollingContext.join('\n');
}


export async function sendUserInputToApi() {
    const userInput = userInputField.value.trim();
    if (userInput) {  // Check if llama is already running
        allowLlamaRun(true);
        updateChatContext("User: " + userInput)
        addUserMessageToChatbox(userInput);
        userInputField.value = '';  // Clear input field

        const prompt = getChatContextAsString();

        const responseElement = document.createElement('div');
        responseElement.className = 'message message-response';
        messages.appendChild(responseElement);

        try {
            for await (const chunk of llama(prompt)) {
                updateChatContext("Assistant" + chunk)
                displayResponseInChatbox(chunk, responseElement);  // Display response in UI
            }
        } catch (error) {
            console.error("Failed to run model:", error);
        } finally {
            allowLlamaRun(false);  // Release the lock
        }
    }
}

// It's expected to return a promise that resolves with the graph data.
export async function fetchRepoDataAsync(repoId, isFileLevel = false) {
    // Determine the file path based on the isFileLevel flag.
    const filePath = isFileLevel ? `${basePath}/assets/${repoId}.json` : `${basePath}/assets/files/${repoId}.json`;

    try {

        console.log("trying to fetch json for:" + filePath);

        const response = await fetch(filePath);

        // It's good practice to check if the response is successful, to catch HTTP errors.
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Reverse the link directions right after fetching the data.
        reverseFlowAndColorize(data);

        // Return the processed data.
        return data;
    } catch (error) {
        console.error(`There was a problem with the fetch operation for ${repoId}: `, error);

        return null;
    }
}


export function processLocalPath() {
    var localPath = document.getElementById('local-path-input').value;


    setInterval(() => {
        checkForUpdates('repos_graph.json');
    }, 5000); // Check every 5 seconds


    fetch('http://127.0.0.1:7000/process/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: localPath })
    })
        .then(response => response.json())
        .then(data => {
            console.log(data);
            alert('Local path processed successfully.');
            loadNewGraph("repos");
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Failed to process local path.');
        });
}



export function cloneAndProcessRepos() {
    var repoUrls = document.getElementById('repo-urls-input').value.split('\n');

    console.log("about to clone" + repoUrls);

    setInterval(() => {
        checkForUpdates('repos_graph.json');
    }, 5000); // Check every 5 seconds

    fetch('http://127.0.0.1:7000/clone_and_process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_urls: repoUrls })
    })
        .then(response => response.json())
        .then(data => {
            console.log(data);
            // Instead of just calling the function, ensure it resolves first
            loadNewGraph("repos_graph");

            alert('Repositories processed successfully.');
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Failed to clone and process repositories.');
        });
}

// Function to initialize application data
export async function loadFileTrees() {
    // Define the paths for your data files
    const paths = {
        reposFileTrees: `${basePath}/index/repos_file_trees.json`,
        readmeData: `${basePath}/assets/repos_readme.json`
    };

    // Load the data asynchronously
    try {
        const results = await Promise.all([
            loadJsonData(paths.reposFileTrees),
            loadJsonData(paths.readmeData)
        ]);

        // Destructure the results array and assign the data to your global properties
        const [reposFileTrees, readmeData] = results;

        if (reposFileTrees && readmeData) {
            // Assign data to the global window object
            appState.reposFileTrees = reposFileTrees;
            appState.readmeData = readmeData;

            // If 'fileTrees' and 'readmeJsons' are the same as 'reposFileTrees' and 'readmeData', assign them directly
            appState.fileTrees = appState.reposFileTrees;
            appState.readmeJsons = appState.readmeData;

            console.log('Data initialized and set globally successfully');
        } else {
            console.error('Failed to load one or more data files');
        }
    } catch (error) {
        console.error('An error occurred during initialization:', error);
    }

    // Here, you could also initialize other application settings or load additional resources as needed
}
