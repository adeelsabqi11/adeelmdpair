const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const router = express.Router();

function removeFolder(folderPath) {
    if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    const id = makeid();
    const tempDir = path.join(__dirname, 'temp', id);
    const phoneNumber = (req.query.number || '').replace(/\D/g, '');

    if (!phoneNumber) {
        return res.status(400).send({ error: "Please provide a valid phone number" });
    }

    async function createSocketSession() {
        const { state, saveCreds } = await useMultiFileAuthState(tempDir);
        const logger = pino({ level: "fatal" }).child({ level: "fatal" });

        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            printQRInTerminal: false,
            generateHighQualityLinkPreview: true,
            logger,
            syncFullHistory: false,
            browser: Browsers.macOS("Safari")
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open") {
                await delay(5000);

                try {
                    const credsPath = path.join(tempDir, 'creds.json');
                    const sessionData = fs.readFileSync(credsPath, 'utf8');
                    const base64 = Buffer.from(sessionData).toString('base64');
                    const sessionId = "MAFIA-MD~" + base64;

                    await sock.sendMessage(sock.user.id, { text: sessionId });

                    const successMsg = {
                        text:
                            `🚀 *MAFIA-MD Session Created!*\n\n` +
                            `▸ *Never share* your session ID\n` +
                            `▸ Join our WhatsApp Channel\n` +
                            `▸ Report bugs on GitHub\n\n` +
                            `_Powered by MAFIA-MD_\n\n` +
                            `🔗 *Useful Links:*\n` +
                            `▸ GitHub: https://github.com/adeelsabqi11/MAFIA-AI-XMD\n` +
                            `▸ WhatsApp: https://whatsapp.com/channel/0029VbCDC5M3wtbG50hWK83w`,
                        contextInfo: {
                            mentionedJid: [sock.user.id],
                            forwardingScore: 1000,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: "120363315182578784@newsletter",
                                newsletterName: "مــــؔــــافـــــؔــیــــا عــؔــدیــؔـــــل",
                                serverMessageId: 143
                            }
                        }
                    };

                    await sock.sendMessage(sock.user.id, successMsg);

                } catch (err) {
                    console.error("❌ Session Error:", err.message);
                    await sock.sendMessage(sock.user.id, {
                        text: `⚠️ Error: ${err.message.includes('rate limit') ? 'Server is busy. Try later.' : err.message}`
                    });
                } finally {
                    await delay(1000);
                    await sock.ws.close();
                    removeFolder(tempDir);
                    console.log(`✅ ${sock.user.id} session completed`);
                    process.exit();
                }

            } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                console.log("🔁 Reconnecting...");
                await delay(10);
                createSocketSession();
            }
        });

        if (!sock.authState.creds.registered) {
            await delay(1500);
            const pairingCode = await sock.requestPairingCode(phoneNumber, "ADEELKHAN");
            if (!res.headersSent) {
                return res.send({ code: pairingCode });
            }
        }
    }

    try {
        await createSocketSession();
    } catch (err) {
        console.error("🚨 Fatal Error:", err.message);
        removeFolder(tempDir);
        if (!res.headersSent) {
            res.status(500).send({ code: "Service Unavailable. Try again later." });
        }
    }
});

module.exports = router;
