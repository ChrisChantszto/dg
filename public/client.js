// This file is run by the browser each time your view template is loaded

/**
 * Define variables that reference elements included in /views/index.html:
 */

// Forms
const dbForm = document.getElementById("databaseForm")
const pageForm = document.getElementById("pageForm")
const blocksForm = document.getElementById("blocksForm")
const commentForm = document.getElementById("commentForm")
const transcribeForm = document.getElementById("transcribeForm");

// Table cells where API responses will be appended
const dbResponseEl = document.getElementById("dbResponse")
const pageResponseEl = document.getElementById("pageResponse")
const blocksResponseEl = document.getElementById("blocksResponse")
const commentResponseEl = document.getElementById("commentResponse")
const transcribeResponseEl = document.getElementById("transcribeResponse");

const transcriptArea = document.getElementById("transcript");

async function getMicrophone() {
  const userMedia = await navigator.mediaDevices.getUserMedia({
    audio: true,
  });

  return new MediaRecorder(userMedia);
}

async function openMicrophone(microphone, socket) {
  await microphone.start(500);

  microphone.onstart = () => {
    console.log("client: microphone opened");
    document.body.classList.add("recording");
  };

  microphone.onstop = () => {
    console.log("client: microphone closed");
    document.body.classList.remove("recording");
  };

  microphone.ondataavailable = (e) => {
    console.log("client: sent data to websocket");
    socket.emit("packet-sent", e.data);
  };
}

async function closeMicrophone(microphone) {
  microphone.stop();
}

async function start(socket) {
  const recordButton = document.getElementById("record");
  let microphone;

  console.log("client: waiting to open microphone");

  recordButton.addEventListener("click", async () => {
    console.log("clieng: record button clicked")

    if (!microphone) {
      // open and close the microphone
      microphone = await getMicrophone();
      await openMicrophone(microphone, socket);
    } else {
      await closeMicrophone(microphone);
      console.log('client: microphone started, attempting to close');
      microphone = undefined;
    }
  });
}

window.addEventListener("load", () => {
  const socket = io((options = { transports: ["websocket"] }));

  socket.on("connect", async () => {
    console.log("client: connected to websocket");
    await start(socket);
  });

  socket.on("transcript", (transcript) => {
    /** transcriptArea.value += transcript + "\n"; **/
    transcriptArea.value += transcript + "\n";
    console.log(transcript);
  });
});
/**
 * Functions to handle appending new content to /views/index.html
 */

// Appends the API response to the UI
const appendApiResponse = function (apiResponse, el) {
  console.log(apiResponse)

  // Add success message to UI
  const newParagraphSuccessMsg = document.createElement("p")
  newParagraphSuccessMsg.innerHTML = "Result: " + apiResponse.message
  el.appendChild(newParagraphSuccessMsg)
  // See browser console for more information
  if (apiResponse.message === "error") return

  // Add ID of Notion item (db, page, comment) to UI
  const newParagraphId = document.createElement("p")
  newParagraphId.innerHTML = "ID: " + apiResponse.data.id
  el.appendChild(newParagraphId)

  // Add URL of Notion item (db, page) to UI
  if (apiResponse.data.url) {
    const newAnchorTag = document.createElement("a")
    newAnchorTag.setAttribute("href", apiResponse.data.url)
    newAnchorTag.innerText = apiResponse.data.url
    el.appendChild(newAnchorTag)
  }
}

// Appends the blocks API response to the UI
const appendBlocksResponse = function (apiResponse, el) {
  console.log(apiResponse)

  // Add success message to UI
  const newParagraphSuccessMsg = document.createElement("p")
  newParagraphSuccessMsg.innerHTML = "Result: " + apiResponse.message
  el.appendChild(newParagraphSuccessMsg)

  // Add block ID to UI
  const newParagraphId = document.createElement("p")
  newParagraphId.innerHTML = "ID: " + apiResponse.data.results[0].id
  el.appendChild(newParagraphId)
}

/**
 * Attach submit event handlers to each form included in /views/index.html
 */

// Attach submit event to each form
dbForm.onsubmit = async function (event) {
  event.preventDefault()

  const dbName = event.target.dbName.value
  const body = JSON.stringify({ dbName })

  const newDBResponse = await fetch("/databases", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  })
  const newDBData = await newDBResponse.json()

  appendApiResponse(newDBData, dbResponseEl)
}

pageForm.onsubmit = async function (event) {
  event.preventDefault()

  const dbID = event.target.newPageDB.value
  const pageName = event.target.newPageName.value
  const header = event.target.header.value
  const body = JSON.stringify({ dbID, pageName, header })

  const newPageResponse = await fetch("/pages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  })

  const newPageData = await newPageResponse.json()
  appendApiResponse(newPageData, pageResponseEl)
}

transcribeForm.onsubmit = async function (event) {
  event.preventDefault()

  // Get page ID and transcript content
  const pageID = event.target.pageID.value
  const transcript = event.target.transcript.value

  console.log(pageID)
  // Format the body to match the structure expected by the Notion API
  const body = JSON.stringify({
    "children": [
      {
        "object": "block",
        "type": "paragraph",
        "paragraph": {
          "rich_text": [
            {
              "type": "text",
              "text": {
                "content": transcript
              }
            }
          ]
        }
      }
    ]
  })

  // Send the POST request to the appropriate endpoint
  const newTranscriptionResponse = await fetch(`/blocks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  })

  // Convert the response to JSON
  const newTranscriptionData = await newTranscriptionResponse.json()

  // Append the response to the UI
  appendApiResponse(newTranscriptionData, transcribeResponseEl)
}