const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Deepgram } = require("@deepgram/sdk");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const client = new Deepgram(process.env.DEEPGRAM_API_KEY);

// Notion SDK for javascript
const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_API_KEY })

let keepAlive;

const setupDeepgram = (socket) => {
  const deepgram = client.transcription.live({
    language: "en",
    punctuate: true,
    smart_format: true,
    model: "nova",
    diarize: true
  });

  if (keepAlive) clearInterval(keepAlive);
  keepAlive = setInterval(() => {
    console.log("deepgram: keepalive");
    deepgram.keepAlive();
  }, 10 * 1000);

  deepgram.addListener("open", async () => {
    console.log("deepgram: connected");

    deepgram.addListener("close", async () => {
      console.log("deepgram: disconnected");
      clearInterval(keepAlive);
      deepgram.finish();
    });

    deepgram.addListener("error", async (error) => {
      console.log("deepgram: error recieved");
      console.error(error);
    });

    deepgram.addListener("transcriptReceived", (packet) => {
      console.log("deepgram: packet received");
      const data = JSON.parse(packet);
      const { type } = data;
      switch (type) {
        case "Results":
          console.log("deepgram: transcript received");
          const transcript = data.channel.alternatives[0].transcript ?? "";
          console.log("socket: transcript sent to client");
          socket.emit("transcript", transcript);
          break;
        case "Metadata":
          console.log("deepgram: metadata received");
          break;
        default:
          console.log("deepgram: unknown packet received");
          break;
      }
    });
  });

  return deepgram;
};

io.on("connection", (socket) => {
  console.log("socket: client connected");
  let deepgram = setupDeepgram(socket);

  socket.on("packet-sent", (data) => {
    console.log("socket: client data received");

    if (deepgram.getReadyState() === 1 /* OPEN */) {
      console.log("socket: data sent to deepgram");
      deepgram.send(data);
    } else if (deepgram.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */) {
      console.log("socket: data couldn't be sent to deepgram");
      console.log("socket: retrying connection to deepgram");
      /* Attempt to reopen the Deepgram connection */
      deepgram.finish();
      deepgram.removeAllListeners();
      deepgram = setupDeepgram(socket);
    } else {
      console.log("socket: data couldn't be sent to deepgram");
    }
  });

  socket.on("disconnect", () => {
    console.log("socket: client disconnected");
    deepgram.finish();
    deepgram.removeAllListeners();
    deepgram = null;
  });
});

app.use(express.static("public/"));
app.use(express.json())
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.post("/databases", async function (request, response) {
  const pageId = process.env.NOTION_PAGE_ID;
  const title = request.body.dbName;

  try {
    // Notion API request!
    const newDb = await notion.databases.create({
      parent: {
        type: "page_id",
        page_id: pageId,
      },
      title: [
        {
          type: "text",
          text: {
            content: title,
          },
        },
      ],
      properties: {
        Name: {
          title: {},
        },
      },
    });
    response.json({ message: "success!", data: newDb });
  } catch (error) {
    response.json({ message: "error", error });
  }
});

// Create new page. The database ID is provided in the web form.
app.post("/pages", async function (request, response) {
  const { dbID, pageName, header } = request.body

  try {
    const newPage = await notion.pages.create({
      parent: {
        type: "database_id",
        database_id: dbID,
      },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: pageName,
              },
            },
          ],
        },
      },
      children: [
        {
          object: "block",
          heading_2: {
            rich_text: [
              {
                text: {
                  content: header,
                },
              },
            ],
          },
        },
      ],
    })
    response.json({ message: "success!", data: newPage })
  } catch (error) {
    response.json({ message: "error", error })
  }
})

// Create new block (page content). The page ID is provided in the web form.
app.post("/blocks", async function (request, response) {
  const { pageID, transcript } = request.body

  try {
    const newBlock = await notion.blocks.children.append({
      block_id: pageID, // a block ID can be a page ID
      children: [
        {
          // Use a paragraph as a default but the form or request can be updated to allow for other block types: https://developers.notion.com/reference/block#keys
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: transcript,
                },
              },
            ],
          },
        },
      ],
    })
    response.json({ message: "success!", data: newBlock })
  } catch (error) {
    response.json({ message: "error", error })
  }
})

// Create new page comments. The page ID is provided in the web form.
app.post("/comments", async function (request, response) {
  const { pageID, comment } = request.body

  try {
    const newComment = await notion.comments.create({
      parent: {
        page_id: pageID,
      },
      rich_text: [
        {
          text: {
            content: comment,
          },
        },
      ],
    })
    response.json({ message: "success!", data: newComment })
  } catch (error) {
    response.json({ message: "error", error })
  }
})

server.listen(3000, () => {
  console.log("listening on localhost:3000");
});

const listener = app.listen(process.env.PORT, function () {
  console.log("Your app is listening on port (notion) " + listener.address().port);
})