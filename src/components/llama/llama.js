// llama.js: has llama util functions

import { displayResponseInChatbox, addUserMessageToChatbox, appState } from '../api/api.js';
import { updateChatContext } from '../../utils.js'

export function createReadmeSummaryPrompt(readmeData) {

    // Add brief intro 
    let prompt = "The following README describes a software project. Provide a concise summary covering the project's purpose, key capabilities, target users and overall business value:\n\n";
  
    // Highlight key sections
    prompt += "\n## \n";
    prompt += readmeData.id + "\n";
  
    // Add the full README content
    prompt += "\n" + readmeData.content + "\n";
  
    // Ask summary questions
    prompt += "\nWhat is the project's primary goal and target user base?\n";
    prompt += "What are the key features and business capabilities provided by the software?\n";
  
    // Explicitly request summary  
    prompt += "\nProvide a high-level summary capturing the project's core business value, target users, and key capabilities based on the information above.";
  
    return prompt;
  }
  
  export function createFileSummaryPrompt(fileData) {
    // Start the prompt with an introduction to the task
    let prompt = "Summarize the purpose and functionality of a code file that is part of a larger system:\n\n";
  
    // Include the file path for context
    prompt += `File Path: ${fileData.file_path}\n\n`;
  
    // Discuss the classes contained in the file
    if (fileData.class_names && fileData.class_names.length > 0) {
      prompt += "The file contains the following classes:\n";
      fileData.class_names.forEach(cls => {
        prompt += `- ${cls}\n`;
      });
      prompt += "\n";
    }
  
    // NEW: Discuss the properties defined in the file
    if (fileData.property_declarations && fileData.property_declarations.length > 0) {
      prompt += "It defines the following properties:\n";
      fileData.property_declarations.forEach(prop => {
        prompt += `- ${prop}\n`;
      });
      prompt += "\n";
    }
  
    // Discuss the functions/methods in the file
    if (fileData.functions && fileData.functions.length > 0) {
      prompt += "It has the following key functions:\n";
      fileData.functions.forEach(func => {
        prompt += `- ${func.name}(${func.parameters.join(', ')}) - Return type: ${func.return_type}\n`;
      });
      prompt += "\n";
    }
  
    // Instruct the model to analyze the file's responsibility
    prompt += "What is the main responsibility of this file in the context of its properties, methods, and classes?\n";
  
    // Ask the model to analyze how the file fits into the overall system
    prompt += "How do the properties defined in this file contribute to its functionality and the broader system architecture?\n";
  
    // Request a summary describing the core functionality and purpose of this file
    prompt += "\nProvide a summary describing the core functionality and purpose of this file in the system, with a focus on the roles and implications of the properties defined within.";
  
    return prompt;
  }
  
  export async function fetchFileSummary(filePath) {
    const readmeData = appState.readmeJsons.find(item => item.id === filePath);
    const fileData = appState.fileTrees.find(item => item.file_path === filePath);
  
    console.log("filePath: " + filePath);
  
    console.log(appState.fileTrees);
    if (!fileData && !readmeData) {
      console.error('File not found');
      return;
    }
  
    let displayMsg = null;
    let prompt = "You are a helpful assistant. Be concise and do not stray from the users' requests. Continue the conversation and ask any clarifying questions in order to best serve the user's needs.";
  
    if (!appState.isAtTopLevel && fileData) {
      displayMsg = "Please summarize the following file: " + filePath.split('/').pop();
      prompt += createFileSummaryPrompt(fileData);
    } else if (appState.isAtTopLevel && readmeData) {
      displayMsg = "Please summarize the following README: " + readmeData.id;
      prompt += createReadmeSummaryPrompt(readmeData);
    }
  
    // Use the llama function to process the prompt
    try {
      updateChatContext("User: " + displayMsg)
      addUserMessageToChatbox(displayMsg);
      // userInputField.value = '';  // Clear input field
  
      // Create a single response element
      const responseElement = document.createElement('div');
      responseElement.className = 'message message-response';
      messages.appendChild(responseElement);
  
      let content;
  
      for await (const chunk of llama(prompt)) {
        console.log(chunk);
        content += chunk;
        updateChatContext("Assistant" + chunk)
        displayResponseInChatbox(chunk, responseElement);  // Display response in UI
      }
      return content;
    } catch (error) {
      console.error("Error in fetchFileSummary: ", error);
      throw error; // Propagate the error upwards
    }
  }

  export async function* llama(prompt, params = {}, config = {}) {
    const controller = new AbortController();
    const api_url = config.api_url || "http://localhost:8081/v1/chat/completions";
  
    // const paramDefaults = {
    //   n_predict: 200,
    //   temperature: 0.6
    // };
  
    const completionParams = {
      model: "lmstudio-ai/wizardlm/WizardLM-2-7B.Q4_K_S.gguf",
      messages: [
        { "role": "system", "content": "You are an excellent software engineer and assistant. Please consider the following conversation dialog prior to continuing the conversation." },
        { "role": "user", "content": prompt }
      ],
      stream: true,
      ...params
    };
  
    const response = await fetch(api_url, {
      method: 'POST',
      body: JSON.stringify(completionParams),
      headers: {
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...(params.api_key ? { 'Authorization': `Bearer ${params.api_key}` } : {})
      },
      signal: controller.signal,
    });
  
    console.log("Response status: " + response.status);
  
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
  
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("Stream ended.");
          break;
        }
        buffer += decoder.decode(value, { stream: true });
  
        console.log("Buffer after decode: " + buffer);
  
        let eolIndex;
        while ((eolIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, eolIndex).trim();
          buffer = buffer.slice(eolIndex + 1);
          console.log("Processed line: " + line);
  
          if (line.startsWith("data:")) {
            try {
              const data = JSON.parse(line.slice(5));
              console.log("Data parsed:", data);
              if (data.choices && data.choices[0] && data.choices[0].delta) {
                const messageContent = data.choices[0].delta.content;
                if (messageContent !== undefined) {  // Check if the content is not undefined
                  console.log("Yielding content:", messageContent);
                  yield messageContent;  // Yield the message content
                }
              }
            } catch (error) {
              console.error("Error parsing JSON:", error);
              console.error("Faulty JSON string:", line.slice(5));
            }
          }
        }
      }
    } catch (e) {
      console.error("Streaming error:", e);
    } finally {
      reader.releaseLock();
      controller.abort();
    }
  }