// audio.js: Manages audio recording and transcription.

import { displayResponseInChatbox, addUserMessageToChatbox, transcribeAudioApi } from '../api/api.js';
import { updateChatContext, phoneticEncode, phoneticSimilarity } from '../../utils.js';

document.addEventListener('DOMContentLoaded', function () {

  //View
  var microphoneButton = document.getElementsByClassName("start-recording-button")[0];
  var recordingControlButtonsContainer = document.getElementsByClassName("recording-contorl-buttons-container")[0];
  var stopRecordingButton = document.getElementsByClassName("stop-recording-button")[0];
  var cancelRecordingButton = document.getElementsByClassName("cancel-recording-button")[0];
  var elapsedTimeTag = document.getElementsByClassName("elapsed-time")[0];
  var closeBrowserNotSupportedBoxButton = document.getElementsByClassName("close-browser-not-supported-box")[0];
  var overlay = document.getElementsByClassName("overlay")[0];
  var audioElement = document.getElementsByClassName("audio-element")[0];
  var audioElementSource = document.getElementsByClassName("audio-element")[0]
    .getElementsByTagName("source")[0];
  var textIndicatorOfAudiPlaying = document.getElementsByClassName("text-indication-of-audio-playing")[0];


  //Controller

  /** Stores the actual start time when an audio recording begins to take place to ensure elapsed time start time is accurate*/
  var audioRecordStartTime;

  /** Stores the maximum recording time in hours to stop recording once maximum recording hour has been reached */
  var maximumRecordingTimeInHours = 1;

  /** Stores the reference of the setInterval function that controls the timer in audio recording*/
  var elapsedTimeTimer;

  //Listeners

  //Listen to start recording button
  microphoneButton.onclick = startAudioRecording;

  //Listen to stop recording button
  stopRecordingButton.onclick = stopAudioRecording;

  //Listen to cancel recording button
  cancelRecordingButton.onclick = cancelAudioRecording;

  //Listen to when the ok button is clicked in the browser not supporting audio recording box
  closeBrowserNotSupportedBoxButton.onclick = hideBrowserNotSupportedOverlay;

  //Listen to when the audio being played ends
  audioElement.onended = hideTextIndicatorOfAudioPlaying;

  /** Displays recording control buttons */
  function handleDisplayingRecordingControlButtons() {
    //Hide the microphone button that starts audio recording
    microphoneButton.style.display = "none";

    //Display the recording control buttons
    recordingControlButtonsContainer.classList.remove("hide");

    //Handle the displaying of the elapsed recording time
    handleElapsedRecordingTime();
  }

  /** Hide the displayed recording control buttons */
  function handleHidingRecordingControlButtons() {
    //Display the microphone button that starts audio recording
    microphoneButton.style.display = "block";

    //Hide the recording control buttons
    recordingControlButtonsContainer.classList.add("hide");

    //stop interval that handles both time elapsed and the red dot
    clearInterval(elapsedTimeTimer);
  }

  /** Displays browser not supported info box for the user*/
  function displayBrowserNotSupportedOverlay() {
    overlay.classList.remove("hide");
  }

  /** Displays browser not supported info box for the user*/
  function hideBrowserNotSupportedOverlay() {
    overlay.classList.add("hide");
  }

  /** Creates a source element for the the audio element in the HTML document*/
  function createSourceForAudioElement() {
    let sourceElement = document.createElement("source");
    audioElement.appendChild(sourceElement);

    audioElementSource = sourceElement;
  }

  /** Display the text indicator of the audio being playing in the background */
  function displayTextIndicatorOfAudioPlaying() {
    textIndicatorOfAudiPlaying.classList.remove("hide");
  }

  /** Hide the text indicator of the audio being playing in the background */
  function hideTextIndicatorOfAudioPlaying() {
    textIndicatorOfAudiPlaying.classList.add("hide");
  }



  /** Starts the audio recording*/
  function startAudioRecording() {

    console.log("Recording Audio...");

    //If a previous audio recording is playing, pause it
    let recorderAudioIsPlaying = !audioElement.paused; // the paused property tells whether the media element is paused or not
    console.log("paused?", !recorderAudioIsPlaying);
    if (recorderAudioIsPlaying) {
      audioElement.pause();
      //also hide the audio playing indicator displayed on the screen
      hideTextIndicatorOfAudioPlaying();
    }

    //start recording using the audio recording API
    audioRecorder.start()
      .then(() => { //on success

        //store the recording start time to display the elapsed time according to it
        audioRecordStartTime = new Date();

        //display control buttons to offer the functionality of stop and cancel
        handleDisplayingRecordingControlButtons();
      })
      .catch(error => { //on error
        //No Browser Support Error
        if (error.message.includes("mediaDevices API or getUserMedia method is not supported in this browser.")) {
          console.log("To record audio, use browsers like Chrome and Firefox.");
          displayBrowserNotSupportedOverlay();
        }

        //Error handling structure
        switch (error.name) {
          case 'AbortError': //error from navigator.mediaDevices.getUserMedia
            console.log("An AbortError has occured.");
            break;
          case 'NotAllowedError': //error from navigator.mediaDevices.getUserMedia
            console.log("A NotAllowedError has occured. User might have denied permission.");
            break;
          case 'NotFoundError': //error from navigator.mediaDevices.getUserMedia
            console.log("A NotFoundError has occured.");
            break;
          case 'NotReadableError': //error from navigator.mediaDevices.getUserMedia
            console.log("A NotReadableError has occured.");
            break;
          case 'SecurityError': //error from navigator.mediaDevices.getUserMedia or from the MediaRecorder.start
            console.log("A SecurityError has occured.");
            break;
          case 'TypeError': //error from navigator.mediaDevices.getUserMedia
            console.log("A TypeError has occured.");
            break;
          case 'InvalidStateError': //error from the MediaRecorder.start
            console.log("An InvalidStateError has occured.");
            break;
          case 'UnknownError': //error from the MediaRecorder.start
            console.log("An UnknownError has occured.");
            break;
          default:
            console.log("An error occured with the error name " + error.name);
        };
      });
  }
  /** Stop the currently started audio recording & sends it
   */
  function stopAudioRecording() {

    console.log("Stopping Audio Recording...");

    //stop the recording using the audio recording API
    audioRecorder.stop()
      .then(audioAsblob => {
        //Play recorder audio
        sendAudioForTranscription(audioAsblob);

        //hide recording control button & return record icon
        handleHidingRecordingControlButtons();
      })
      .catch(error => {
        //Error handling structure
        switch (error.name) {
          case 'InvalidStateError': //error from the MediaRecorder.stop
            console.log("An InvalidStateError has occured.");
            break;
          default:
            console.log("An error occured with the error name " + error.name);
        };
      });
  }

  /** Cancel the currently started audio recording */
  function cancelAudioRecording() {
    console.log("Canceling audio...");

    //cancel the recording using the audio recording API
    audioRecorder.cancel();

    //hide recording control button & return record icon
    handleHidingRecordingControlButtons();
  }


  /** Sends recorded audio to a server endpoint and handles the transcription response
   * @param {Blob} recorderAudioAsBlob - recorded audio as a Blob Object 
  */
  async function sendAudioForTranscription(recorderAudioAsBlob) {
    // Create an audio context
    let audioCtx = new AudioContext();

    // Decode the original audio to an AudioBuffer
    let originalBuffer = await audioCtx.decodeAudioData(await recorderAudioAsBlob.arrayBuffer());

    // Create an AudioContext with the desired sample rate (16kHz)
    let desiredSampleRate = 16000;
    let offlineCtx = new OfflineAudioContext(originalBuffer.numberOfChannels, originalBuffer.length, desiredSampleRate);

    // Create a buffer source
    let bufferSource = offlineCtx.createBufferSource();
    bufferSource.buffer = originalBuffer;

    // Connect source to context
    bufferSource.connect(offlineCtx.destination);

    // Start the source
    bufferSource.start();

    // Render the audio at the new sample rate
    let renderedBuffer = await offlineCtx.startRendering();

    // Convert the rendered buffer back to a Blob
    let wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);

    // Prepare the form data
    let formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');
    formData.append('temperature', '0.0');
    formData.append('temperature_inc', '0.2');
    formData.append('response_format', 'json');

    // Send the audio file to the server
    transcribeAudioApi(formData);
  }

  /** Convert an AudioBuffer to a WAV Blob */
  function bufferToWave(audioBuffer, length) {
    let numberOfChannels = audioBuffer.numberOfChannels;
    let sampleRate = audioBuffer.sampleRate;
    let format = new WavEncoder(sampleRate, numberOfChannels);

    let buffers = [];
    for (let channel = 0; channel < numberOfChannels; channel++) {
      buffers[channel] = audioBuffer.getChannelData(channel);
    }

    return format.encode(buffers, length);
  }

  /** WavEncoder - Utility for encoding audio data in WAV format */
  class WavEncoder {
    constructor(sampleRate, numChannels) {
      this.sampleRate = sampleRate;
      this.numChannels = numChannels;
      this.bytesPerSample = 2; // For 16-bit samples
    }

    encode(buffers, length) {
      let buffer = new ArrayBuffer(44 + length * this.numChannels * this.bytesPerSample);
      let view = new DataView(buffer);

      // Write WAV header
      this._writeString(view, 0, 'RIFF'); // ChunkID
      view.setUint32(4, 36 + length * this.numChannels * this.bytesPerSample, true); // ChunkSize
      this._writeString(view, 8, 'WAVE'); // Format
      this._writeString(view, 12, 'fmt '); // Subchunk1ID
      view.setUint32(16, 16, true); // Subchunk1Size
      view.setUint16(20, 1, true); // AudioFormat
      view.setUint16(22, this.numChannels, true); // NumChannels
      view.setUint32(24, this.sampleRate, true); // SampleRate
      view.setUint32(28, this.sampleRate * this.numChannels * this.bytesPerSample, true); // ByteRate
      view.setUint16(32, this.numChannels * this.bytesPerSample, true); // BlockAlign
      view.setUint16(34, 16, true); // BitsPerSample
      this._writeString(view, 36, 'data'); // Subchunk2ID
      view.setUint32(40, length * this.numChannels * this.bytesPerSample, true); // Subchunk2Size

      // Write audio data
      let offset = 44;
      for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < this.numChannels; channel++) {
          let sample = Math.max(-1, Math.min(1, buffers[channel][i])); // Clamp the sample to [-1, 1]
          sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF; // Convert to 16-bit
          view.setInt16(offset, sample, true);
          offset += 2;
        }
      }

      return new Blob([buffer], { type: 'audio/wav' });
    }

    _writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }
  }

  /** Computes the elapsed recording time since the moment the function is called in the format h:m:s*/
  function handleElapsedRecordingTime() {
    //display inital time when recording begins
    displayElapsedTimeDuringAudioRecording("00:00");

    //create an interval that compute & displays elapsed time, as well as, animate red dot - every second
    elapsedTimeTimer = setInterval(() => {
      //compute the elapsed time every second
      let elapsedTime = computeElapsedTime(audioRecordStartTime); //pass the actual record start time
      //display the elapsed time
      displayElapsedTimeDuringAudioRecording(elapsedTime);
    }, 1000); //every second
  }

  /** Display elapsed time during audio recording
   * @param {String} elapsedTime - elapsed time in the format mm:ss or hh:mm:ss 
   */
  function displayElapsedTimeDuringAudioRecording(elapsedTime) {
    //1. display the passed elapsed time as the elapsed time in the elapsedTime HTML element
    elapsedTimeTag.innerHTML = elapsedTime;

    //2. Stop the recording when the max number of hours is reached
    if (elapsedTimeReachedMaximumNumberOfHours(elapsedTime)) {
      stopAudioRecording();
    }
  }

  /**
   * @param {String} elapsedTime - elapsed time in the format mm:ss or hh:mm:ss  
   * @returns {Boolean} whether the elapsed time reached the maximum number of hours or not
   */
  function elapsedTimeReachedMaximumNumberOfHours(elapsedTime) {
    //Split the elapsed time by the symbo :
    let elapsedTimeSplitted = elapsedTime.split(":");

    //Turn the maximum recording time in hours to a string and pad it with zero if less than 10
    let maximumRecordingTimeInHoursAsString = maximumRecordingTimeInHours < 10 ? "0" + maximumRecordingTimeInHours : maximumRecordingTimeInHours.toString();

    //if it the elapsed time reach hours and also reach the maximum recording time in hours return true
    if (elapsedTimeSplitted.length === 3 && elapsedTimeSplitted[0] === maximumRecordingTimeInHoursAsString)
      return true;
    else //otherwise, return false
      return false;
  }

  /** Computes the elapsedTime since the moment the function is called in the format mm:ss or hh:mm:ss
   * @param {String} startTime - start time to compute the elapsed time since
   * @returns {String} elapsed time in mm:ss format or hh:mm:ss format, if elapsed hours are 0.
   */
  function computeElapsedTime(startTime) {
    //record end time
    let endTime = new Date();

    //time difference in ms
    let timeDiff = endTime - startTime;

    //convert time difference from ms to seconds
    timeDiff = timeDiff / 1000;

    //extract integer seconds that dont form a minute using %
    let seconds = Math.floor(timeDiff % 60); //ignoring uncomplete seconds (floor)

    //pad seconds with a zero if neccessary
    seconds = seconds < 10 ? "0" + seconds : seconds;

    //convert time difference from seconds to minutes using %
    timeDiff = Math.floor(timeDiff / 60);

    //extract integer minutes that don't form an hour using %
    let minutes = timeDiff % 60; //no need to floor possible incomplete minutes, becase they've been handled as seconds
    minutes = minutes < 10 ? "0" + minutes : minutes;

    //convert time difference from minutes to hours
    timeDiff = Math.floor(timeDiff / 60);

    //extract integer hours that don't form a day using %
    let hours = timeDiff % 24; //no need to floor possible incomplete hours, becase they've been handled as seconds

    //convert time difference from hours to days
    timeDiff = Math.floor(timeDiff / 24);

    // the rest of timeDiff is number of days
    let days = timeDiff; //add days to hours

    let totalHours = hours + (days * 24);
    totalHours = totalHours < 10 ? "0" + totalHours : totalHours;

    if (totalHours === "00") {
      return minutes + ":" + seconds;
    } else {
      return totalHours + ":" + minutes + ":" + seconds;
    }
  }

  // audio-recording.js ---------------
  //API to handle audio recording 

  var audioRecorder = {
    /** Stores the recorded audio as Blob objects of audio data as the recording continues*/
    audioBlobs: [],/*of type Blob[]*/
    /** Stores the reference of the MediaRecorder instance that handles the MediaStream when recording starts*/
    mediaRecorder: null, /*of type MediaRecorder*/
    /** Stores the reference to the stream currently capturing the audio*/
    streamBeingCaptured: null, /*of type MediaStream*/
    /** Start recording the audio 
     * @returns {Promise} - returns a promise that resolves if audio recording successfully started
     */
    start: function () {
      //Feature Detection
      if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
        //Feature is not supported in browser
        //return a custom error
        return Promise.reject(new Error('mediaDevices API or getUserMedia method is not supported in this browser.'));
      }

      else {
        //Feature is supported in browser

        //create an audio stream
        return navigator.mediaDevices.getUserMedia({ audio: true }/*of type MediaStreamConstraints*/)
          //returns a promise that resolves to the audio stream
          .then(stream /*of type MediaStream*/ => {

            //save the reference of the stream to be able to stop it when necessary
            audioRecorder.streamBeingCaptured = stream;

            //create a media recorder instance by passing that stream into the MediaRecorder constructor
            audioRecorder.mediaRecorder = new MediaRecorder(stream); /*the MediaRecorder interface of the MediaStream Recording
                API provides functionality to easily record media*/

            //clear previously saved audio Blobs, if any
            audioRecorder.audioBlobs = [];

            //add a dataavailable event listener in order to store the audio data Blobs when recording
            audioRecorder.mediaRecorder.addEventListener("dataavailable", event => {
              //store audio Blob object
              audioRecorder.audioBlobs.push(event.data);
            });

            //start the recording by calling the start method on the media recorder
            audioRecorder.mediaRecorder.start();
          });

        /* errors are not handled in the API because if its handled and the promise is chained, the .then after the catch will be executed*/
      }
    },
    /** Stop the started audio recording
     * @returns {Promise} - returns a promise that resolves to the audio as a blob file
     */
    stop: function () {
      //return a promise that would return the blob or URL of the recording
      return new Promise(resolve => {
        //save audio type to pass to set the Blob type
        let mimeType = audioRecorder.mediaRecorder.mimeType;

        //listen to the stop event in order to create & return a single Blob object
        audioRecorder.mediaRecorder.addEventListener("stop", () => {
          //create a single blob object, as we might have gathered a few Blob objects that needs to be joined as one
          let audioBlob = new Blob(audioRecorder.audioBlobs, { type: mimeType });

          //resolve promise with the single audio blob representing the recorded audio
          resolve(audioBlob);
        });
        audioRecorder.cancel();
      });
    },
    /** Cancel audio recording*/
    cancel: function () {
      //stop the recording feature
      audioRecorder.mediaRecorder.stop();

      //stop all the tracks on the active stream in order to stop the stream
      audioRecorder.stopStream();

      //reset API properties for next recording
      audioRecorder.resetRecordingProperties();
    },
    /** Stop all the tracks on the active stream in order to stop the stream and remove
     * the red flashing dot showing in the tab
     */
    stopStream: function () {
      //stopping the capturing request by stopping all the tracks on the active stream
      audioRecorder.streamBeingCaptured.getTracks() //get all tracks from the stream
        .forEach(track /*of type MediaStreamTrack*/ => track.stop()); //stop each one
    },
    /** Reset all the recording properties including the media recorder and stream being captured*/
    resetRecordingProperties: function () {
      audioRecorder.mediaRecorder = null;
      audioRecorder.streamBeingCaptured = null;
    }
  }
});

